#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/output/loveable"
mkdir -p "$OUT_DIR"
cat > "$OUT_DIR/index.html" <<'HTML'
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Loveable Frontend</title>
    <link rel="stylesheet" href="styles.css">
  </head>
  <body>
    <div class="container">
      <h1>Loveable — Outreach Control</h1>
      <div>
        <label>Search query</label>
        <input id="query" value="restaurants in Jhelum" />
        <button id="scrape">Scrape</button>
        <button id="append">Append to Sheet</button>
        <button id="preview">Generate Previews</button>
        <div style="display:inline-block;margin-left:8px">
          <label><input type="radio" name="sendMode" value="test" checked> Send to test recipient</label>
          <label style="margin-left:8px"><input type="radio" name="sendMode" value="real"> Send to real addresses</label>
        </div>
        <button id="sendtest">Send (respect mode)</button>
      </div>
      <pre id="out"></pre>
    </div>

    <!-- Confirmation modal (hidden) -->
    <div id="confirm-modal" style="display:none;position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;">
      <div style="background:#fff;padding:18px;border-radius:8px;max-width:520px;margin:50px auto;">
        <h3>Confirm sending to real addresses</h3>
        <p>This will send emails to the actual addresses found in the sheet or scraped data. Please confirm you have permission to contact these recipients.</p>
        <label><input type="checkbox" id="confirm-checkbox"> I confirm I have permission to email these addresses</label>
        <div style="margin-top:12px">
          <button id="confirm-send-btn">Confirm and Send</button>
          <button id="confirm-cancel-btn">Cancel</button>
        </div>
      </div>
    </div>

    <script src="app.js"></script>
  </body>
</html>
HTML

cat > "$OUT_DIR/app.js" <<'JS'
const out = document.getElementById('out');
const btn = document.getElementById('scrape');
const btnAppend = document.getElementById('append');
const btnPreview = document.getElementById('preview');
const btnSendTest = document.getElementById('sendtest');
const queryEl = document.getElementById('query');

function apiBase() {
  return {
    scraper: 'http://localhost:3001',
    task: 'http://localhost:3004',
    writer: 'http://localhost:3003',
    sender: 'http://localhost:3002'
  };
}

btn.addEventListener('click', async () => {
  out.textContent = 'Running scrape...';
  try {
    const base = apiBase();
    const res = await fetch(base.scraper + '/ai-business-lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ searchQuery: queryEl.value }) });
    const data = await res.json();
    window._lastScrape = data;
    out.textContent = JSON.stringify(data, null, 2);
  } catch (err) { out.textContent = 'Error: ' + err; }
});

btnAppend.addEventListener('click', async () => {
  out.textContent = 'Appending rows to task sheet...';
  const base = apiBase();
  const data = window._lastScrape || [];
  const results = [];
  for (const b of data) {
    const payload = { task: b.name || '', description: (b.location||'') + ' | phone: ' + (b.phone||''), deadline: '', status: 'todo' };
    try { const r = await fetch(base.task + '/Sheet_management', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)}); results.push(await r.json()); }
    catch (err) { results.push({ error: String(err) }); }
  }
  out.textContent = JSON.stringify(results, null, 2);
});

btnPreview.addEventListener('click', async () => {
  out.textContent = 'Generating previews...';
  const base = apiBase();
  const rows = window._lastScrape || [];
  const payload = { subject: 'Hello [NAME] - Partnership Opportunity', body: 'Hi [NAME],\n\nWe noticed [NAME] in Jhelum and would love to discuss a partnership.\n\nBest,\nOutreach Team', data: rows.map(r=>({ Name: r.name, Emails: r.emails })) };
  try { const r = await fetch(base.writer + '/email_writting', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)}); const body = await r.json(); window._lastPreviews = body; out.textContent = JSON.stringify(body, null, 2); }
  catch (err) { out.textContent = 'Error: ' + err; }
});

btnSendTest.addEventListener('click', async () => {
  const mode = (document.querySelector('input[name="sendMode"]:checked')||{}).value || 'test';
  if (mode === 'real') { document.getElementById('confirm-modal').style.display='flex'; return; }
  out.textContent = 'Sending to test recipient...';
  const base = apiBase();
  const previews = window._lastPreviews || [];
  const test = '24-ee-55@students.uettaxila.edu.pk';
  const results = [];
  if (previews.length === 0) { const rows = window._lastScrape||[]; for(const b of rows){ const payload = { recipient_email: test, subject: `Hello ${b.name}`, body: `Hi ${b.name}`, email_id: String(Date.now()) }; try{ const r = await fetch(base.sender + '/email_management', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); results.push(await r.json()); } catch(err){ results.push({ error: String(err) }); } } }
  else { for (const p of previews) { const payload = { recipient_email: test, subject: p.subject, body: p.body, email_id: p.email_id }; try { const r = await fetch(base.sender + '/email_management',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); results.push(await r.json()); } catch (err){ results.push({ error: String(err) }); } } }
  out.textContent = JSON.stringify(results, null, 2);
});

// Confirm modal handlers
const confirmModal = document.getElementById('confirm-modal');
const confirmBtn = document.getElementById('confirm-send-btn');
const confirmCancel = document.getElementById('confirm-cancel-btn');
confirmCancel.addEventListener('click', ()=>{ confirmModal.style.display='none'; });
confirmBtn.addEventListener('click', async ()=>{
  const checked = document.getElementById('confirm-checkbox').checked;
  if (!checked) { alert('Please check the confirmation box to proceed.'); return; }
  confirmModal.style.display='none';
  out.textContent = 'Sending to real recipients...';
  const base = apiBase(); const previews = window._lastPreviews||[]; const rows = window._lastScrape||[]; const results = [];
  if (previews.length === 0) { for (const b of rows) { const to = (b.emails||'').split(/[;,]/)[0]||''; if (!to) { results.push({ error:'no email', name: b.name}); continue;} const payload={recipient_email: to, subject:`Hello ${b.name}`, body:`Hi ${b.name}`, email_id: String(Date.now())}; try{ const r=await fetch(base.sender + '/email_management', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); results.push(await r.json()); } catch(err){ results.push({ error:String(err), to }); } } }
  else { for (const p of previews) { const to = p.recipient || p.recipient_email || p.original_recipient || ''; if (!to) { results.push({ error:'no recipient', email_id: p.email_id}); continue; } const payload={ recipient_email: to, subject: p.subject, body: p.body, email_id: p.email_id }; try { const r = await fetch(base.sender + '/email_management', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); results.push(await r.json()); } catch(err){ results.push({ error:String(err), to }); } } }
  out.textContent = JSON.stringify(results, null, 2);
});

cat > "$OUT_DIR/styles.css" <<'CSS'
body{font-family:Arial,Helvetica,sans-serif;background:#fafafa;color:#222}
.container{max-width:900px;margin:40px auto;padding:20px;background:#fff;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.06)}
pre{background:#111;color:#9f9;padding:12px;border-radius:6px;overflow:auto}
input{padding:6px;margin-right:8px;width:60%}
button{padding:6px 10px}
CSS

echo "Created frontend scaffold at $OUT_DIR"
echo "You can serve it with the included Dockerfile via docker-compose or open index.html in your browser for local testing."
