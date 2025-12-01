const { google } = require('googleapis');

function makeRawMessage(to, subject, body, from) {
  const str = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body
  ].join('\n');
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendViaGmail(oAuth2Client, { to, subject, text, from }) {
  const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
  const raw = makeRawMessage(to, subject, text, from || 'me');
  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  return res.data;
}

module.exports = { sendViaGmail };
