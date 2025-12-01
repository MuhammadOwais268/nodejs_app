// Simple integration smoke tests for core services
// Run with: node tests/run_smoke_tests.js

const services = {
  orchestrator: { base: 'http://localhost:4010' },
  scraper: { base: 'http://localhost:3101' },
  email_sending: { base: 'http://localhost:3102' },
  email_writing: { base: 'http://localhost:3103' },
  task_management: { base: 'http://localhost:3104' },
  frontend: { base: 'http://localhost:8080' },
  mailhog: { base: 'http://localhost:8025' }
};

async function ok(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}:`, err.message || err);
  }
}

async function run() {
  console.log('Starting smoke tests...');

  // Orchestrator /google/oauth/start should redirect (302)
  await ok('orchestrator: oauth start (302 expected)', async () => {
    const r = await fetch(services.orchestrator.base + '/google/oauth/start', { redirect: 'manual' });
    if (r.status !== 302) throw new Error('expected 302, got ' + r.status);
    const loc = r.headers.get('location') || '';
    if (!loc.includes('accounts.google.com')) throw new Error('unexpected redirect location: ' + loc);
  });

  // Orchestrator /update-settings (requires x-orch-secret if set) - do a harmless write
  await ok('orchestrator: update-settings', async () => {
    const payload = { updates: [ { app: 'email-writing', env: { SMOKE_TEST_TS: String(Date.now()) } } ] };
    const r = await fetch(services.orchestrator.base + '/update-settings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-orch-secret': process.env.ORCH_SECRET || 'dev_orch_secret' }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!j.ok) throw new Error('update-settings returned not ok: ' + JSON.stringify(j));
  });

  // Health endpoints
  for (const [k,v] of Object.entries(services)) {
    await ok(`${k}: health`, async () => {
      const url = v.base + '/health';
      const r = await fetch(url).catch(e => { throw new Error('fetch failed: ' + e.message) });
      if (r.status !== 200) throw new Error('status ' + r.status);
      // accept any JSON body
    });
  }

  // Writer: POST /email_writting
  await ok('email-writing: generate preview', async () => {
    const payload = { subject: 'Test [NAME]', body: 'Hello [NAME]', data: [{ Name: 'Test', Emails: 'test@example.test' }], test_recipient: 'test@example.test' };
    const r = await fetch(services.email_writing.base + '/email_writting', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!j) throw new Error('empty response');
  });

  // Sender: POST /email_management
  await ok('email-sending: send (smoke)', async () => {
    const payload = { recipient_email: 'recipient@example.test', subject: 'Smoke test', body: 'This is a smoke test.' };
    const r = await fetch(services.email_sending.base + '/email_management', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!j || typeof j !== 'object') throw new Error('unexpected response');
    if (j.error) throw new Error('error from sender: ' + j.error);
    if (!j.result) throw new Error('missing result');
  });

  // MailHog UI reachable
  await ok('mailhog: UI reachable', async () => {
    const r = await fetch(services.mailhog.base + '/');
    if (r.status !== 200) throw new Error('mailhog UI not reachable');
  });

  console.log('Smoke tests completed.');
}

run().catch(e => { console.error('Smoke tests runner failed:', e); process.exit(1); });
