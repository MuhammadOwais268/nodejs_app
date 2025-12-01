const { getAuthClient } = require('./auth');
const { google } = require('googleapis');
const { sendViaGmail } = require('./gmail');

async function run({ spreadsheetEmailId, spreadsheetTaskId, recipient }) {
  if (!spreadsheetEmailId || !spreadsheetTaskId) {
    throw new Error('Please provide spreadsheetEmailId and spreadsheetTaskId');
  }
  if (!recipient) throw new Error('Please provide recipient email');

  const scopes = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/gmail.send'
  ];

  const auth = await getAuthClient({ scopes });

  const sheets = google.sheets({ version: 'v4', auth });
  const now = new Date().toISOString();
  const row = ['verification', now, 'ok'];

  console.log('Appending to email spreadsheet:', spreadsheetEmailId);
  const appendEmail = await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetEmailId,
    range: 'Sheet1!A:C',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });

  console.log('Appending to task spreadsheet:', spreadsheetTaskId);
  const appendTask = await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetTaskId,
    range: 'Sheet1!A:C',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });

  console.log('Sending test email to', recipient);
  const mailRes = await sendViaGmail(auth, {
    to: recipient,
    subject: 'Test from email-sending-app',
    text: `This is a verification test sent at ${now}`,
    from: 'me'
  });

  return { appendEmail: appendEmail.data, appendTask: appendTask.data, mailRes };
}

// Allow running from CLI with env vars
if (require.main === module) {
  const spreadsheetEmailId = process.env.SPREADSHEET_EMAIL_ID;
  const spreadsheetTaskId = process.env.SPREADSHEET_TASK_ID;
  const recipient = process.env.TEST_RECIPIENT;

  run({ spreadsheetEmailId, spreadsheetTaskId, recipient }).then(res => {
    console.log('Append email response:', JSON.stringify(res.appendEmail));
    console.log('Append task response:', JSON.stringify(res.appendTask));
    console.log('Mail response:', JSON.stringify(res.mailRes));
  }).catch(err => {
    console.error('Verification failed:', err && err.message ? err.message : err);
    process.exit(1);
  });
}
