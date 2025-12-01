const fs = require('fs');
const path = require('path');
let axios;
try { axios = require('axios'); } catch (e) { axios = null; }
const csvParse = (text) => {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    // naive CSV parse
    const cols = line.split(',');
    const obj = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = (cols[i]||'').replace(/^"|"$/g,'');
    return obj;
  });
  return rows;
};

function generatePersonalized(subjectTemplate, bodyTemplate, row, idIndex) {
  // Templating: replace placeholders with row values.
  // Supports placeholders like [NAME], {{name}}, {{email}}, {{website}}, {{location}}, {{company}}
  const get = (k) => {
    if (!k) return '';
    // Try direct match with common casing variants
    const direct = row[k] || row[k.toLowerCase()] || row[k.toUpperCase()] || row[capitalize(k)];
    if (direct) return String(direct);
    // Try common alternate keys
    const alt = {
      name: ['Name', 'name', 'Full Name', 'full_name'],
      email: ['Emails', 'Email', 'email', 'emails', 'e-mail'],
      website: ['Website', 'website', 'URL', 'url'],
      company: ['Company', 'company', 'Organisation', 'Organization'],
      location: ['Location', 'location', 'City', 'city']
    };
    if (alt[k]) {
      for (const a of alt[k]) if (row[a]) return String(row[a]);
    }
    return '';
  };

  function capitalize(s) { return s && s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function titleCase(s) { return String(s || '').split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').trim(); }

  const name = get('name') || extractNameFromEmail(get('email')) || '';
  const email = (get('email') || '').split(/[;,]/)[0] || '';
  const website = normalizeWebsite(get('website'));
  const location = get('location') || '';
  const company = get('company') || inferCompanyFromWebsite(website) || '';

  let subject = String(subjectTemplate || '');
  let body = String(bodyTemplate || '');

  // Replace bracketed placeholders [NAME] and generic {{key}} placeholders (case-insensitive)
  subject = subject.replace(/\[NAME\]/g, name).replace(/\[COMPANY\]/g, company);
  body = body.replace(/\[NAME\]/g, name).replace(/\[COMPANY\]/g, company);

  // Replace {{key}} style placeholders
  body = body.replace(/\{\{\s*([a-zA-Z0-9_\- ]+)\s*\}\}/g, (_, key) => {
    const k = key.trim();
    const low = k.toLowerCase();
    if (low === 'name') return name;
    if (low === 'email') return email;
    if (low === 'website') return website;
    if (low === 'location') return location;
    if (low === 'company') return company;
    // fallback to row value if present
    return get(low) || '';
  });

  subject = subject.replace(/\{\{\s*([a-zA-Z0-9_\- ]+)\s*\}\}/g, (_, key) => {
    const low = key.trim().toLowerCase();
    if (low === 'name') return name;
    if (low === 'company') return company;
    if (low === 'website') return website;
    if (low === 'location') return location;
    if (low === 'email') return email;
    return get(low) || '';
  });

  const email_id = idIndex.toString();
  return { email_id, recipient: email, subject: titleCase(subject).trim(), body: body.trim() };

  function extractNameFromEmail(e) {
    if (!e) return '';
    const m = e.match(/^([^@]+)@/);
    if (!m) return '';
    const part = m[1].replace(/[._\-]/g, ' ');
    return titleCase(part.replace(/\d+/g, '').trim());
  }

  function normalizeWebsite(w) {
    if (!w) return '';
    try { w = String(w).trim(); } catch (e) { return ''; }
    // remove protocol
    w = w.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    return w;
  }

  function inferCompanyFromWebsite(w) {
    if (!w) return '';
    const host = w.split('/')[0];
    const parts = host.split('.');
    if (parts.length >= 2) {
      // pick second-level domain
      const sld = parts[parts.length-2];
      return titleCase(sld);
    }
    return titleCase(host);
  }
}

async function callLLMForRow(row, subjectTemplate, bodyTemplate) {
  // Build a strict prompt that asks the model to return JSON {subject, body}
  // We instruct the model to only output a single JSON object, nothing else.
  const prompt = `You are a helpful email writer.
Instructions:
- Use the SUBJECT_TEMPLATE and BODY_TEMPLATE to produce a personalized subject and body.
- Output ONLY valid JSON and NOTHING ELSE. The JSON must be exactly an object with two keys: "subject" and "body".
- Keep the subject short (<= 80 characters). Keep the body between 2 and 8 sentences.
- Do not include extra commentary or explanation.

EXAMPLES:
1) SUBJECT_TEMPLATE: "Quick update for [NAME]"
   BODY_TEMPLATE: "Hi [NAME],\nWe thought you'd be interested in our new plan."
   RESULT: { "subject": "Quick update for Alice", "body": "Hi Alice,\nWe thought you'd be interested in our new plan." }

2) SUBJECT_TEMPLATE: "Special for [NAME]"
   BODY_TEMPLATE: "Hey [NAME],\nWe have a special deal for you."
   RESULT: { "subject": "Special for Bob", "body": "Hey Bob,\nWe have a special deal for you." }

SUBJECT_TEMPLATE:
${subjectTemplate}

BODY_TEMPLATE:
${bodyTemplate}

CONTACT:
${JSON.stringify(row, null, 2)}

Return ONLY the JSON object now (no backticks, no explanation).`;

  // Normalize provider selection. Supported providers: 'ollama' (local) and 'openai'.
  const rawProvider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
  const provider = rawProvider === 'openai' ? 'openai' : 'ollama';
  const llmUrl = process.env.LLM_URL || (provider === 'ollama' ? 'http://localhost:11434/api/generate' : null);
  // Default model selection: allow provider-specific env overrides
  const model = process.env.LLM_MODEL || 'llama2';

  // We'll implement an internal fallback chain: try the configured provider first,
  // then try OpenAI (if configured). If all fail, fall back to deterministic templating.
  async function tryProvider(p) {
    if (p === 'ollama') {
      if (!llmUrl) throw new Error('OLLAMA URL not configured (LLM_URL)');
      const resp = await axios.post(llmUrl, { model, prompt }, { timeout: 30000 });
      return resp && resp.data ? resp.data : null;
    }
    if (p === 'openai') {
      const { callOpenAI } = require('./llm/openai');
      const apiKey = process.env.LLM_OPENAI_API_KEY;
      if (!apiKey) throw new Error('OpenAI API key not set (LLM_OPENAI_API_KEY)');
      const text = await callOpenAI(prompt, model, apiKey, 30000);
      return text;
    }
    throw new Error('unsupported_provider');

    // Generic provider
    if (!llmUrl) throw new Error('LLM_URL not configured for generic provider');
    const resp = await axios.post(llmUrl, { prompt, model }, { timeout: 30000 });
    return resp && resp.data ? resp.data : null;
  }

  // Sequence of providers to try: configured provider, then OpenAI (if present and not first), then templating.
  const tried = [];
  let lastErr = null;
  const primary = provider;
  const secondary = (provider !== 'openai' && process.env.LLM_OPENAI_API_KEY) ? 'openai' : null;

  // Build attempt sequence: try primary, then OpenAI if available.
  const sequence = [];
  if (primary) sequence.push(primary);
  if (secondary && !sequence.includes('openai')) sequence.push(secondary);

  for (const p of sequence) {
    try {
      tried.push(p);
      const raw = await tryProvider(p);
      // Normalize raw into text string
      let text = null;
      if (!raw) text = null;
      else if (typeof raw === 'string') text = raw;
      else if (raw.data && typeof raw.data === 'string') text = raw.data;
      else if (Array.isArray(raw.results) && raw.results[0]) text = raw.results[0].content || raw.results[0].text || JSON.stringify(raw.results[0]);
      else if (raw.result) text = raw.result;
      else if (raw.choices && raw.choices[0]) text = raw.choices[0].message?.content || raw.choices[0].text;
      else if (raw.text) text = raw.text;
      else text = JSON.stringify(raw);

      if (!text) throw new Error('Empty response from ' + p);

      // Try to parse JSON strictly; if parsing fails, attempt loose extraction.
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        const subjMatch = text.match(/"?subject"?\s*[:\-]\s*"?([^\n\"]+)"?/i);
        const bodyMatch = text.match(/"?body"?\s*[:\-]\s*"?([\s\S]+)"?/i);
        parsed = {
          subject: subjMatch ? subjMatch[1].trim() : undefined,
          body: bodyMatch ? bodyMatch[1].trim() : text.trim()
        };
      }
      return { subject: parsed.subject || '', body: parsed.body || '', provider: p };
    } catch (err) {
      lastErr = err;
      console.warn('[writer] LLM provider', p, 'failed:', err && err.message ? err.message : err);
      // If Gemini returned the special gemini_404 signal, skip trying other providers
      if (p === 'gemini' && err && (err.message === 'gemini_404' || err.message === 'gemini_unavailable')) {
        console.warn('[writer] Gemini unavailable — returning deterministic template fallback');
        const gen = generatePersonalized(subjectTemplate, bodyTemplate, row, 0);
        return { subject: gen.subject || '', body: gen.body || '', provider: 'template_fallback', error: String(err && err.message ? err.message : err) };
      }
      // otherwise continue to next provider (OpenAI) or fall back to template at the end
    }
  }

  // Final fallback: deterministic templating
  console.warn('[writer] All LLM providers failed (' + tried.join(',') + '), falling back to deterministic templating');
  const gen = generatePersonalized(subjectTemplate, bodyTemplate, row, 0);
  return { subject: gen.subject || '', body: gen.body || '', provider: 'template_fallback', error: lastErr && lastErr.message ? String(lastErr.message) : undefined };
}

async function run(input) {
  // input: { subject, body }
  try { console.debug('[writer] run called, input keys:', Object.keys(input||{})); } catch(e){}
  const subject = input.subject || (input.body && input.body.subject) || '';
  const body = input.body || (input.body && input.body.body) || '';
  const dataCsv = process.env.DATA_CSV || path.join(process.cwd(), 'data.csv');
  let rows = [];

  // Prefer direct input data from the caller (frontend or smoke tests).
  if (Array.isArray(input.data) && input.data.length > 0) {
    // If the caller provided rows directly, use them for per-row personalization.
    rows = input.data;
  } else {
    // Otherwise try to load rows from the configured CSV file (useful for local runs).
    try {
      if (fs.existsSync(dataCsv)) {
        const csvText = fs.readFileSync(dataCsv, 'utf8');
        rows = csvParse(csvText);
      }
    } catch (e) {
      console.debug('[writer] no input.data provided and failed to read CSV or CSV missing:', e.message || e);
    }
  }

  const out = [];
  let id = 1;
  for (const r of rows) {
    // Gather emails from the row. If none are present but a TEST_RECIPIENT
    // environment variable is set (useful for local smoke tests), use it so
    // previews can still be generated.
    let emails = (r.Emails || r.emails || '').split(/[;,]/).map(s => s.trim()).filter(Boolean);
    if (emails.length === 0) {
      try { console.debug('[writer] no emails found on row, input.test_recipient:', input.test_recipient); } catch(e){}
      // Prefer explicit test recipients passed in the request (input.test_recipient or input.test_recipients),
      // otherwise fall back to TEST_RECIPIENT env var. This allows the caller (smoke tests) to trigger previews
      // without needing the service process to have environment variables set.
      if (Array.isArray(input.test_recipients) && input.test_recipients.length) {
        emails = input.test_recipients;
      } else if (input.test_recipient) {
        emails = [input.test_recipient];
      } else if (process.env.TEST_RECIPIENT) {
        emails = [process.env.TEST_RECIPIENT];
      }
    }
    for (const e of emails) {
      r.Emails = e; // set single email for template
      // If configured to use an LLM, use it for personalization; else use templating.
      if (process.env.USE_LLM === 'true') {
        try {
          console.debug('[writer] calling LLM for row', { idx: id, recipient: e, provider: process.env.LLM_PROVIDER });
          const llmRes = await callLLMForRow(r, subject, body);
          console.debug('[writer] LLM response for row', { idx: id, subject: llmRes.subject && llmRes.subject.substring(0,120), bodyPreview: llmRes.body && llmRes.body.substring(0,120), provider: llmRes.provider });
          const email_id = String(id++);
          out.push({ email_id, recipient: e, subject: llmRes.subject || '', body: llmRes.body || '', provider: llmRes.provider || provider });
        } catch (err) {
          // Unexpected error: fall back to deterministic templating so the UI can still preview
          console.warn('[writer] Unexpected LLM failure, falling back to template for row:', err && err.message ? err.message : err);
          const gen = generatePersonalized(subject, body, r, id);
          const email_id = String(id++);
          out.push({ email_id, recipient: gen.recipient || e, subject: gen.subject || '', body: gen.body || '', provider: 'template_fallback', error: String(err && err.message ? err.message : err) });
        }
      } else {
        // Non-LLM path: use simple templating
        const gen = generatePersonalized(subject, body, r, id++);
        if (gen.recipient) out.push(Object.assign({}, gen, { provider: 'template' }));
      }
    }
  }

  return out;
}

module.exports = run;
