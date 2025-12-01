const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let orchestrator = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

function orchestratorPath() {
  // assume orchestrator is in output/orchestrator/server.js relative to repo
  return path.resolve(__dirname, '..', '..', 'orchestrator', 'server.js');
}

ipcMain.handle('orch-start', async () => {
  if (orchestrator && !orchestrator.killed) return { ok: true, pid: orchestrator.pid };
  const script = orchestratorPath();
  if (!fs.existsSync(script)) {
    return { ok: false, error: 'orchestrator not found at ' + script };
  }
  orchestrator = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'] });
  orchestrator.stdout.on('data', d => sendLog('orch', d.toString()));
  orchestrator.stderr.on('data', d => sendLog('orch', d.toString()));
  orchestrator.on('exit', (code, sig) => sendLog('orch', `exited code=${code} sig=${sig}`));
  return { ok: true, pid: orchestrator.pid };
});

ipcMain.handle('orch-stop', async () => {
  if (!orchestrator) return { ok: false, error: 'not running' };
  try {
    orchestrator.kill();
    orchestrator = null;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

function sendLog(source, text) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('log', { source, text });
  }
}

// Simple HTTP helper using built-in fetch (Node 18+)
async function postJson(url, body) {
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = text; }
    return { ok: res.ok, status: res.status, body: json };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

ipcMain.handle('run-scrape', async (e, searchQuery) => {
  const url = 'http://127.0.0.1:3001/ai-business-lookup';
  return await postJson(url, { searchQuery });
});

ipcMain.handle('run-preview', async (e, templates) => {
  // templates: { subject, body }
  const url = 'http://127.0.0.1:3003/email_writting';
  return await postJson(url, templates);
});

ipcMain.handle('run-send', async (e, payload) => {
  // payload: { recipient_email, subject, body, email_id }
  const url = 'http://127.0.0.1:3002/email_management';
  return await postJson(url, payload);
});

ipcMain.handle('select-credentials', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

ipcMain.handle('docker-up', async () => {
  // Run the helper script to build and start docker-compose
  try {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const script = path.join(repoRoot, 'scripts', 'run_docker.sh');
    if (!fs.existsSync(script)) return { ok: false, error: 'run_docker.sh not found' };
    const child = spawn(script, { shell: true });
    child.stdout.on('data', d => sendLog('docker', d.toString()));
    child.stderr.on('data', d => sendLog('docker', d.toString()));
    return { ok: true, pid: child.pid };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
