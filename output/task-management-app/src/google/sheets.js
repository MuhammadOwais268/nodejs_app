const { google } = require('googleapis');

async function getSheetsClient(auth) {
  return google.sheets({ version: 'v4', auth });
}

async function appendRow(auth, spreadsheetId, range, values) {
  const sheets = await getSheetsClient(auth);
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [values] }
  });
  return res.data;
}

async function clearSheet(auth, spreadsheetId, range) {
  const sheets = await getSheetsClient(auth);
  return sheets.spreadsheets.values.clear({ spreadsheetId, range });
}

async function getRows(auth, spreadsheetId, range) {
  const sheets = await getSheetsClient(auth);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

module.exports = { appendRow, clearSheet, getRows };
