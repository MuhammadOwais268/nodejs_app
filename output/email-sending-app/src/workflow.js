const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { getAuthClient } = require('./google/auth');
const { sendViaGmail } = require('./google/gmail');
// No Mailtrap support: prefer Gmail OAuth (USE_GMAIL_API=true) or SMTP.

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

let transporter = null;
// Configure SMTP transporter (used for MailHog/local dev) if SMTP_HOST is set.
if (SMTP_HOST) {
    // Some SMTP servers (like MailHog) do not require auth. Only attach auth when credentials are provided.
    const transportOpts = {
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
    };
    if (SMTP_USER) {
      transportOpts.auth = {
        user: SMTP_USER,
        pass: SMTP_PASS
      };
    }
    try {
      transporter = nodemailer.createTransport(transportOpts);
      console.log('[email-sending] SMTP transporter configured', { host: SMTP_HOST, port: transportOpts.port, auth: !!transportOpts.auth });
    } catch (e) {
      console.warn('[email-sending] Failed to configure SMTP transporter:', e && e.message ? e.message : e);
      transporter = null;
    }
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function sendMail({ to, subject, text }) {
  // Determine preferred provider for reporting
  const provider = (process.env.USE_GMAIL_API === 'true') ? 'gmail' : (transporter ? 'smtp' : 'none');

  const maxAttempts = 3;
  let lastErr = null;

  if (provider === 'gmail') {
    // Try Gmail API with retries for transient errors. If auth is missing or
    // invalid, getAuthClient will throw an error containing an authUrl which
    // we should surface so the frontend/user can obtain a token.
  // Prefer explicit env paths, but fall back to common filenames written by the orchestrator
  let credentialsPath = process.env.GOOGLE_SHEETS_CREDENTIALS || process.env.GOOGLE_OAUTH_CREDENTIALS;
  let tokenPath = process.env.GOOGLE_SHEETS_TOKEN || process.env.GOOGLE_OAUTH_TOKEN;
  const altCred = path.join(process.cwd(), 'google_oauth_client.json');
  const altToken = path.join(process.cwd(), 'google_token.json');
  if (!credentialsPath && fs.existsSync(altCred)) credentialsPath = altCred;
  if (!tokenPath && fs.existsSync(altToken)) tokenPath = altToken;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const auth = await getAuthClient({
          scopes: ['https://www.googleapis.com/auth/gmail.send'],
          credentialsPath,
          tokenPath
        });
        const from = process.env.GMAIL_FROM || 'me';
        const res = await sendViaGmail(auth, { to, subject, text, from });
        return { sent: true, info: res, provider };
      } catch (err) {
        lastErr = err;
        // If the error contains an authUrl, do not retry — user action needed.
        if (err && err.authUrl) {
          return { sent: false, info: { message: err.message, authUrl: err.authUrl }, provider };
        }
        // transient/backoff
        const backoff = attempt * 500;
        console.warn(`[sendMail] Gmail send attempt ${attempt} failed:`, err && err.message ? err.message : err);
        if (attempt < maxAttempts) await sleep(backoff);
      }
    }
    return { sent: false, info: lastErr && (lastErr.message || String(lastErr)), provider };
  }

  if (!transporter) {
    console.log('[sendMail] No SMTP configured, logging instead:\n', { to, subject, text });
    return { sent: false, info: 'no-provider-configured', provider };
  }

  // SMTP path with retries
  const fromAddress = SMTP_USER || process.env.GMAIL_FROM || `no-reply@${process.env.SMTP_HOST || 'localhost'}`;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        text
      });
      return { sent: true, info, provider };
    } catch (err) {
      lastErr = err;
      console.warn(`[sendMail] SMTP send attempt ${attempt} failed:`, err && err.message ? err.message : err);
      if (attempt < maxAttempts) await sleep(attempt * 500);
    }
  }
  return { sent: false, info: lastErr && (lastErr.message || String(lastErr)), provider };
}

function persistRecord(rec) {
  try {
  // Persist per-app CSV inside the email-sending-app folder using a
  // dedicated filename to avoid colliding with other services' data.csv.
  const outPath = path.join(__dirname, '..', 'email-sending-records.csv');
    const exists = fs.existsSync(outPath);
    const header = 'email_id,recipient_email,subject,body,provider,sent,info,timestamp\n';
    const safe = (v) => (String(v||'')).replace(/"/g, '""');
    const row = `${safe(rec.email_id)},"${safe(rec.recipient_email)}","${safe(rec.subject)}","${safe(rec.body)}","${safe(rec.provider)}",${rec.sent? 'true':'false'},"${safe(rec.info)}",${Date.now()}\n`;
    if (!exists) fs.writeFileSync(outPath, header + row);
    else fs.appendFileSync(outPath, row);
  } catch (err) {
    console.warn('persistRecord failed:', err.message);
  }
}

async function run(input) {
  // Expect { recipient_email | recipient | to, subject, body, email_id }
  // Accept multiple field names so the frontend (or legacy callers) can use
  // either `recipient` or `recipient_email` interchangeably.
  const recipient_email = input.recipient_email || input.recipient || input.to || (input.body && (input.body.recipient_email || input.body.recipient || input.body.to));
  const subject = input.subject || (input.body && input.body.subject) || '(no subject)';
  const body = input.body || (input.body && input.body.body) || input.message || '';
  const email_id = input.email_id || (input.body && input.body.email_id) || Date.now().toString();

  // If recipient is missing, don't throw — return a structured failure so the
  // frontend receives a JSON error and can display it instead of triggering
  // a 500 HTTP error. Also persist a record (helps debugging) with an empty
  // recipient.
  if (!recipient_email) {
    const record = { email_id, recipient_email: '', subject, body, provider: 'none', sent: false, info: 'recipient_email is required' };
    persistRecord(record);
    return { mailResult: { sent: false, info: 'recipient_email is required' }, record };
  }

  const mailResult = await sendMail({ to: recipient_email, subject, text: body });

  const record = {
    email_id,
    recipient_email,
    subject,
    body,
    provider: mailResult && mailResult.provider,
    sent: !!(mailResult && mailResult.sent),
    info: (mailResult && mailResult.info) || ''
  };
  persistRecord(record);

  return { mailResult, record };
}

module.exports = run;
