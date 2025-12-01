const { google } = require('googleapis');

async function getSheetsClient(auth) {
  return google.sheets({ version: 'v4', auth });
}

async function getRows(auth, spreadsheetId, range) {
  const sheets = await getSheetsClient(auth);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

module.exports = { getRows };
