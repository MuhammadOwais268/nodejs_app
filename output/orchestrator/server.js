#!/usr/bin/env node
/*
  Simple orchestrator to start and monitor the converted apps.
  - Starts each app as a child process (node src/app.js) in its folder
  - Reads local .env if present and injects into the child env
  - Restarts on crash with exponential backoff
  - Writes per-app logs to output/orchestrator/logs/<app>.log
  - Handles SIGINT/SIGTERM to forward shutdown

  Usage:
    node output/orchestrator/server.js

  Note: run from repository root for paths to resolve correctly.
*/

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.join(ROOT, 'orchestrator', 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const SECRETS_PATH = path.join(ROOT, 'orchestrator', 'secrets.json');
// Ensure orchestrator directory exists
fs.mkdirSync(path.join(ROOT, 'orchestrator'), { recursive: true });

function loadSecrets() {
  try {
    if (!fs.existsSync(SECRETS_PATH)) return {};
    return JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8')) || {};
  } catch (e) {
    return {};
  }
}

function saveSecrets(secrets) {
  try {
    fs.writeFileSync(SECRETS_PATH, JSON.stringify(secrets, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to write secrets file:', e.message || e);
  }
}

let ORCH_SECRETS = loadSecrets();

const apps = [
  { name: 'scraper', cwd: path.join(ROOT, 'scraper-app'), cmd: 'node', args: ['src/app.js'], defaultPort: 3001 },
  { name: 'email-sending', cwd: path.join(ROOT, 'email-sending-app'), cmd: 'node', args: ['src/app.js'], defaultPort: 3002 },
  { name: 'email-writing', cwd: path.join(ROOT, 'email-writing-app'), cmd: 'node', args: ['src/app.js'], defaultPort: 3003 },
  { name: 'task-management', cwd: path.join(ROOT, 'task-management-app'), cmd: 'node', args: ['src/app.js'], defaultPort: 3004 },
];

function parseDotEnv(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const out = {};
    for (let l of lines) {
      l = l.trim();
      if (!l || l.startsWith('#')) continue;
      const eq = l.indexOf('=');
      if (eq === -1) continue;
      const k = l.slice(0, eq).trim();
      let v = l.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      out[k] = v;
    }
    return out;
  } catch (e) {
    return {};
  }
}

function startApp(app) {
  const logPath = path.join(LOG_DIR, `${app.name}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  let restarts = 0;
  let child = null;
  let failureCount = 0;
  let expectedExit = false;
  let healthInterval = null;
  let appPort = app.defaultPort;

  const start = () => {
    const envFile = path.join(app.cwd, '.env');
    const envFromFile = fs.existsSync(envFile) ? parseDotEnv(envFile) : {};
      // Merge process.env, envFromFile, and any secrets for this app (secrets are kept out of .env)
      const env = Object.assign({}, process.env, envFromFile);
      try {
        const appSecrets = ORCH_SECRETS[app.name] || {};
        for (const k of Object.keys(appSecrets)) {
          env[k] = appSecrets[k];
        }
      } catch (e) {
        // ignore
      }

    // determine port for health checks
    appPort = parseInt(env.PORT || app.defaultPort, 10) || app.defaultPort;

    logStream.write(`\n===== START ${new Date().toISOString()} (restarts=${restarts}) =====\n`);
    child = spawn(app.cmd, app.args, { cwd: app.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });

    child.stdout.on('data', d => logStream.write(`[STDOUT ${new Date().toISOString()}] ${d}`));
    child.stderr.on('data', d => logStream.write(`[STDERR ${new Date().toISOString()}] ${d}`));

    child.on('exit', (code, sig) => {
      logStream.write(`\n===== EXIT ${new Date().toISOString()} code=${code} sig=${sig} =====\n`);
      child = null;
      // clear health interval
      if (healthInterval) { clearInterval(healthInterval); healthInterval = null; }

      if (expectedExit) {
        // orchestrator intentionally killed the child because of health; restart quickly
        expectedExit = false;
        restarts = 0;
        const delay = 1000;
        logStream.write(`Intentional restart in ${delay}ms\n`);
        setTimeout(start, delay);
        return;
      }

      restarts++;
      // exponential backoff up to 60s
      const delay = Math.min(1000 * Math.pow(2, Math.min(restarts, 6)), 60000);
      logStream.write(`Restarting in ${delay}ms\n`);
      setTimeout(start, delay);
    });

    // start health check polling after a short delay to let the app boot
    setTimeout(() => {
      if (healthInterval) clearInterval(healthInterval);
      failureCount = 0;
      healthInterval = setInterval(async () => {
        try {
          const url = `http://127.0.0.1:${appPort}/health`;
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(id);
          if (!res.ok) throw new Error('non-OK status ' + res.status);
          // healthy
          if (failureCount > 0) {
            logStream.write(`Health OK for ${app.name} (reset failures)\n`);
          }
          failureCount = 0;
        } catch (err) {
          failureCount++;
          logStream.write(`Health check failed for ${app.name} (count=${failureCount}): ${err.message}\n`);
          // if consecutive failures exceed threshold, restart the child
          if (failureCount >= 2) {
            logStream.write(`Health failing for ${app.name}, initiating restart\n`);
            if (child) {
              expectedExit = true;
              try { child.kill('SIGTERM'); } catch (e) { logStream.write('Error killing child: ' + e.message + '\n'); }
            }
          }
        }
      }, 15000);
    }, 2000);
  };

  start();

  return {
    name: app.name,
    stop: () => {
      if (child) {
        child.kill('SIGTERM');
      }
      if (healthInterval) { clearInterval(healthInterval); healthInterval = null; }
    }
  };
}

const runners = apps.map(startApp);
const runnersByName = {};
for (const r of runners) runnersByName[r.name] = r;

// Minimal HTTP endpoint to accept settings updates and write per-app .env files
const http = require('http');

function writeEnvFileForApp(appName, envUpdates) {
  const appConfig = apps.find(a => a.name === appName);
  if (!appConfig) throw new Error('Unknown app: ' + appName);
  const envPath = path.join(appConfig.cwd, '.env');
  const current = fs.existsSync(envPath) ? parseDotEnv(envPath) : {};
  // Separate sensitive keys into the orchestrator secrets store instead
  const SENSITIVE_KEYS = ['LLM_GEMINI_API_KEY','LLM_OPENAI_API_KEY','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN','GOOGLE_CLIENT_ID'];
  const merged = Object.assign({}, current);
  ORCH_SECRETS[appName] = ORCH_SECRETS[appName] || {};
  for (const k of Object.keys(envUpdates)) {
    if (SENSITIVE_KEYS.includes(k)) {
      // save to orchestrator secrets and do not write into the app .env
      ORCH_SECRETS[appName][k] = envUpdates[k];
    } else {
      merged[k] = envUpdates[k];
    }
  }
  saveSecrets(ORCH_SECRETS);
  // Serialize to .env (simple KEY=VALUE lines)
  const lines = Object.keys(merged).map(k => `${k}=${String(merged[k]).replace(/\n/g, '\\n')}`);
  fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
}

function restartAppByName(appName) {
  const runner = runnersByName[appName];
  if (!runner) throw new Error('No runner for ' + appName);
  // Calling stop() will kill the child; orchestrator will restart it automatically
  runner.stop();
}

const apiServer = http.createServer(async (req, res) => {
  // Google OAuth flow endpoints
  if (req.method === 'GET' && req.url && req.url.startsWith('/google/oauth/start')) {
    try {
      // Prefer env vars; fall back to local client JSON in output/orchestrator
      let clientId = process.env.GOOGLE_CLIENT_ID;
      let clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        const cfgPath = path.join(__dirname, 'google_oauth_client.json');
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
          const web = cfg.web || cfg.installed || {};
          clientId = clientId || web.client_id;
          clientSecret = clientSecret || web.client_secret;
        }
      }
      if (!clientId || !clientSecret) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Google OAuth client_id/client_secret not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in orchestrator env or place google_oauth_client.json in output/orchestrator.');
        return;
      }

      const apiPort = API_PORT;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${apiPort}/google/oauth2callback`;
  // Allow overriding requested scopes via env; default to send + readonly so we can read sent messages later.
  const rawScopes = process.env.GOOGLE_OAUTH_SCOPES || 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly';
  const scope = encodeURIComponent(rawScopes);
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
      res.writeHead(302, { Location: authUrl });
      res.end();
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  if (req.method === 'GET' && req.url && req.url.startsWith('/google/oauth2callback')) {
    try {
      const fullUrl = new URL(req.url, `http://localhost:${API_PORT}`);
      const code = fullUrl.searchParams.get('code');
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing code in callback');
        return;
      }
      // load client config
      let clientId = process.env.GOOGLE_CLIENT_ID;
      let clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const cfgPath = path.join(__dirname, 'google_oauth_client.json');
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        const web = cfg.web || cfg.installed || {};
        clientId = clientId || web.client_id;
        clientSecret = clientSecret || web.client_secret;
      }
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${API_PORT}/google/oauth2callback`;
      if (!clientId || !clientSecret) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Google OAuth client_id/client_secret not configured');
        return;
      }

      // Exchange code for tokens
      const params = new URLSearchParams();
      params.append('code', code);
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      params.append('redirect_uri', redirectUri);
      params.append('grant_type', 'authorization_code');

      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      const tokenData = await tokenResp.json();
      if (!tokenResp.ok) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'token_exchange_failed', details: tokenData }));
        return;
      }

      // Persist tokens for email-sending app
      const outPath = path.join(ROOT, 'email-sending-app', 'google_token.json');
      fs.writeFileSync(outPath, JSON.stringify(tokenData, null, 2), 'utf8');

      // Enable Gmail send in email-sending .env and restart the app
      try {
        writeEnvFileForApp('email-sending', { USE_GMAIL_API: 'true' });
        // restart email-sending to pick up tokens/env
        restartAppByName('email-sending');
      } catch (e) {
        // non-fatal
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Google OAuth successful</h2><p>Tokens saved to email-sending app. You can close this window.</p></body></html>');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  // End Google OAuth endpoints

  if (req.method === 'POST' && req.url === '/update-settings') {
    // Basic secret check to avoid accidental external use. Set ORCH_SECRET in the
    // orchestrator env or docker-compose to enable. If not set, allow for local dev.
    const expected = process.env.ORCH_SECRET || '';
    if (expected) {
      const provided = req.headers['x-orch-secret'] || '';
      if (provided !== expected) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
    }
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body || '{}');
      const updates = payload.updates || [];
      if (!Array.isArray(updates)) throw new Error('updates must be an array');
      for (const u of updates) {
        if (!u.app || !u.env) continue;
        writeEnvFileForApp(u.app, u.env);
        try { restartAppByName(u.app); } catch (e) { /* continue */ }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }
  res.writeHead(404);
  res.end();
});

const API_PORT = process.env.ORCH_API_PORT ? Number(process.env.ORCH_API_PORT) : 4010;
apiServer.listen(API_PORT, () => console.log(`Orchestrator API listening on ${API_PORT}`));

function shutdown() {
  console.log('Orchestrator: shutting down...');
  for (const r of runners) r.stop();
  // give children some time to exit
  setTimeout(() => process.exit(0), 3000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('Orchestrator started. Logs are in', LOG_DIR);
