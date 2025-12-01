const out = document.getElementById('out');
const btn = document.getElementById('scrape');
const queryEl = document.getElementById('query');

btn.addEventListener('click', async () => {
  out.textContent = 'Running scrape...';
  try {
    const base = apiBase();
    const res = await fetch(base.scraper + '/ai-business-lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ searchQuery: queryEl.value }) });
    const data = await res.json();
    // cache last scrape in window for quick flows
    window._lastScrape = data;
    out.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    out.textContent = 'Error: ' + err;
  }
});

const btnAppend = document.getElementById('append');
const btnPreview = document.getElementById('preview');
const btnSendTest = document.getElementById('sendtest');

function apiBase() {
  // If running on the host (file:// or localhost) calls to localhost:PORT will work.
  // Use absolute host ports so both Docker and local dev work when the browser is used.
  return {
    scraper: 'http://localhost:3101',
    task: 'http://localhost:3104',
    writer: 'http://localhost:3103',
    sender: 'http://localhost:3102'
  };
}

btnAppend.addEventListener('click', async () => {
  out.textContent = 'Appending rows to task sheet...';
  const base = apiBase();
  const data = window._lastScrape || [];
  const results = [];
  for (const b of data) {
    const payload = {
      task: b.name || '',
      description: (b.location || '') + ' | phone: ' + (b.phone || '') + ' | site: ' + (b.website || '') + ' | emails: ' + (b.emails || ''),
      deadline: '',
      status: 'todo'
    };
    try {
      const r = await fetch(base.task + '/Sheet_management', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await r.json();
      results.push({ ok: r.ok, status: r.status, body });
    } catch (err) {
      results.push({ ok: false, error: String(err) });
    }
  }
  out.textContent = JSON.stringify(results, null, 2);
});

btnPreview.addEventListener('click', async () => {
  out.textContent = 'Generating previews...';
  const base = apiBase();
  // Use last scrape as data input
  const rows = window._lastScrape || [];
  const payload = {
    subject: 'Hello [NAME] - Partnership Opportunity',
    body: 'Hi [NAME],\n\nWe noticed [NAME] in Jhelum and would love to discuss a partnership.\n\nBest,\nOutreach Team',
    data: rows.map(r => ({ Name: r.name, Emails: r.emails, website: r.website, Phone: r.phone }))
  };
  try {
    const r = await fetch(base.writer + '/email_writting', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await r.json();
    window._lastPreviews = body;
    out.textContent = JSON.stringify(body, null, 2);
  } catch (err) {
    out.textContent = 'Error: ' + err;
  }
});

btnSendTest.addEventListener('click', async () => {
  // Determine selected mode (test or real)
  const mode = (document.querySelector('input[name="sendMode"]:checked') || {}).value || 'test';
  if (mode === 'real') {
    // show confirmation modal
    document.getElementById('confirm-modal').style.display = 'flex';
    return;
  }
  out.textContent = 'Sending to test recipient...';
  const base = apiBase();
  const previews = window._lastPreviews || [];
  const test = '24-ee-55@students.uettaxila.edu.pk';
  const results = [];
  if (previews.length === 0) {
    // fallback: send simple messages for each scraped item
    const rows = window._lastScrape || [];
    for (let i = 0; i < rows.length; i++) {
      const b = rows[i];
      const payload = { recipient_email: test, subject: `Hello ${b.name}`, body: `Hi ${b.name},\n\nWe noticed ${b.name} in Jhelum...`, email_id: String(Date.now()) };
      try {
        const r = await fetch(base.sender + '/email_management', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const body = await r.json();
        results.push({ ok: r.ok, status: r.status, body });
      } catch (err) { results.push({ ok: false, error: String(err) }); }
    }
  } else {
    for (const p of previews) {
      const payload = { recipient_email: test, subject: p.subject, body: p.body, email_id: p.email_id };
      try {
        const r = await fetch(base.sender + '/email_management', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const body = await r.json();
        results.push({ ok: r.ok, status: r.status, body });
      } catch (err) { results.push({ ok: false, error: String(err) }); }
    }
  }
  out.textContent = JSON.stringify(results, null, 2);
});

// Confirmation modal handlers
const confirmModal = document.getElementById('confirm-modal');
const confirmBtn = document.getElementById('confirm-send-btn');
const confirmCancel = document.getElementById('confirm-cancel-btn');
confirmCancel.addEventListener('click', () => { confirmModal.style.display = 'none'; });
confirmBtn.addEventListener('click', async () => {
  const checked = document.getElementById('confirm-checkbox').checked;
  if (!checked) {
    alert('Please check the confirmation box to proceed.');
    return;
  }
  confirmModal.style.display = 'none';
  out.textContent = 'Sending to real recipients (this may send many emails)...';
  const base = apiBase();
  const previews = window._lastPreviews || [];
  const rows = window._lastScrape || [];
  const results = [];
  if (previews.length === 0) {
    // fallback: try to send using emails from scraped rows
    for (const b of rows) {
      const to = (b.emails || '').split(/[;,]/)[0] || '';
      if (!to) { results.push({ ok: false, error: 'no email found', name: b.name }); continue; }
      const payload = { recipient_email: to, subject: `Hello ${b.name}`, body: `Hi ${b.name},\n\nWe noticed ${b.name} in Jhelum...`, email_id: String(Date.now()) };
      try {
        const r = await fetch(base.sender + '/email_management', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const body = await r.json();
        results.push({ ok: r.ok, status: r.status, body, to });
      } catch (err) { results.push({ ok: false, error: String(err), to }); }
    }
  } else {
    for (const p of previews) {
      const to = p.recipient || p.recipient_email || p.original_recipient || '';
      if (!to) { results.push({ ok: false, error: 'no recipient in preview', email_id: p.email_id }); continue; }
      const payload = { recipient_email: to, subject: p.subject, body: p.body, email_id: p.email_id };
      try {
        const r = await fetch(base.sender + '/email_management', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const body = await r.json();
        results.push({ ok: r.ok, status: r.status, body, to });
      } catch (err) { results.push({ ok: false, error: String(err), to }); }
    }
  }
  out.textContent = JSON.stringify(results, null, 2);
});
 
