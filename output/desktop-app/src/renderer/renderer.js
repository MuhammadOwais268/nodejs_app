const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const orchState = document.getElementById('orch-state');
const logs = document.getElementById('logs');
const btnScrape = document.getElementById('btn-scrape');
const scrapeOut = document.getElementById('scrape-out');
const searchQuery = document.getElementById('searchQuery');
const btnPreview = document.getElementById('btn-preview');
const btnSendTest = document.getElementById('btn-send-test');
const btnDocker = document.getElementById('btn-docker');
const subjectEl = document.getElementById('subject');
const bodyEl = document.getElementById('body');
const previewOut = document.getElementById('preview-out');

function appendLog(source, text) {
  logs.textContent += `[${source}] ${text}\n`;
  logs.scrollTop = logs.scrollHeight;
}

btnStart.addEventListener('click', async () => {
  const r = await window.api.startOrchestrator();
  if (r.ok) {
    orchState.textContent = 'running (pid ' + r.pid + ')';
    appendLog('ui', 'Orchestrator started pid=' + r.pid);
  } else {
    appendLog('ui', 'Start failed: ' + (r.error||JSON.stringify(r)));
  }
});

btnStop.addEventListener('click', async () => {
  const r = await window.api.stopOrchestrator();
  if (r.ok) {
    orchState.textContent = 'stopped';
    appendLog('ui', 'Orchestrator stopped');
  } else {
    appendLog('ui', 'Stop failed: ' + (r.error||JSON.stringify(r)));
  }
});

btnDocker.addEventListener('click', async () => {
  appendLog('ui', 'Starting docker-compose (this may take a few minutes)');
  const r = await window.api.dockerUp();
  if (r.ok) appendLog('ui', 'docker helper started pid=' + r.pid);
  else appendLog('ui', 'docker helper failed: ' + (r.error || JSON.stringify(r)));
});

window.api.onLog((d) => appendLog(d.source, d.text));

btnScrape.addEventListener('click', async () => {
  scrapeOut.textContent = 'Running...';
  const q = searchQuery.value || 'restaurants in Jhelum';
  const r = await window.api.runScrape(q);
  scrapeOut.textContent = JSON.stringify(r, null, 2);
  appendLog('scrape', 'done');
});

btnPreview.addEventListener('click', async () => {
  previewOut.textContent = 'Generating...';
  const payload = { subject: subjectEl.value, body: bodyEl.value };
  const r = await window.api.runPreview(payload);
  previewOut.textContent = JSON.stringify(r, null, 2);
  appendLog('preview', 'done');
});

btnSendTest.addEventListener('click', async () => {
  previewOut.textContent = 'Sending...';
  // Try to use generated previews if available
  let previews = [];
  try {
    const p = JSON.parse(previewOut.textContent);
    if (Array.isArray(p)) previews = p;
  } catch (e) { /* ignore */ }

  if (previews.length === 0) {
    // fallback: make single message from subject/body
    previews = [{ email_id: Date.now().toString(), recipient: '', subject: subjectEl.value, body: bodyEl.value }];
  }

  const results = [];
  for (const pv of previews) {
    const payload = { recipient_email: window.TEST_RECIPIENT || '24-ee-55@students.uettaxila.edu.pk', subject: pv.subject, body: pv.body, email_id: pv.email_id };
    const r = await window.api.runSend(payload);
    results.push(r);
    appendLog('send', `sent ${payload.email_id} => ${r.status || r.error}`);
  }
  previewOut.textContent = JSON.stringify(results, null, 2);
});

// allow injecting TEST_RECIPIENT via window.TEST_RECIPIENT if set by packaging
appendLog('ui', 'Ready');
