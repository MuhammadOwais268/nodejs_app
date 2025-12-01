const fs = require('fs');
const path = require('path');
const { getAuthClient } = require('./google/auth');
const { appendRow: sheetsAppendRow, clearSheet: sheetsClear, getRows: sheetsGetRows } = require('./google/sheets');

const dataCsv = process.env.DATA_CSV || path.join(process.cwd(), 'tasks.csv');
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const SHEET_RANGE = process.env.GOOGLE_SHEETS_RANGE || 'Sheet1';

function readRows() {
  if (!fs.existsSync(dataCsv)) return [];
  const text = fs.readFileSync(dataCsv, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = (cols[i]||'').replace(/^"|"$/g,''));
    return obj;
  });
}

function appendRow(obj) {
  const headers = ['Task','Description','Deadline','Status'];
  const exists = fs.existsSync(dataCsv);
  const row = headers.map(h => `"${(obj[h]||'').replace(/"/g,'""')}"`).join(',') + '\n';
  if (!exists) fs.writeFileSync(dataCsv, headers.join(',') + '\n' + row);
  else fs.appendFileSync(dataCsv, row);
}

async function run(input) {
  // input: { action, ... }
  const action = (input.action || '').toString();
  if (action.includes('Clear')) {
    // If Google Sheets configured, clear sheet; otherwise clear local CSV
    if (SPREADSHEET_ID && process.env.GOOGLE_SHEETS_CREDENTIALS) {
      const auth = await getAuthClient({
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        credentialsPath: process.env.GOOGLE_SHEETS_CREDENTIALS,
        tokenPath: process.env.GOOGLE_SHEETS_TOKEN
      });
      await sheetsClear(auth, SPREADSHEET_ID, SHEET_RANGE);
      return { success: true, message: 'Cleared (Google Sheets)' };
    }

    if (fs.existsSync(dataCsv)) fs.unlinkSync(dataCsv);
    return { success: true, message: 'Cleared (local CSV)' };
  }

  if (action.includes('Get')) {
    if (SPREADSHEET_ID && process.env.GOOGLE_SHEETS_CREDENTIALS) {
      const auth = await getAuthClient({
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        credentialsPath: process.env.GOOGLE_SHEETS_CREDENTIALS,
        tokenPath: process.env.GOOGLE_SHEETS_TOKEN
      });
      const vals = await sheetsGetRows(auth, SPREADSHEET_ID, SHEET_RANGE);
      // convert array rows to objects using header row
      if (vals.length === 0) return { success: true, rows: [] };
      const headers = vals[0];
      const data = vals.slice(1).map(r => {
        const o = {};
        headers.forEach((h, i) => o[h] = r[i] || '');
        return o;
      });
      return { success: true, rows: data };
    }

    const rows = readRows();
    return { success: true, rows };
  }

  // otherwise, append task
  const task = {
    Task: input.task || input.Task || input.title || '',
    Description: input.description || input.Description || '',
    Deadline: input.deadline || input.Deadline || '',
    Status: input.status || input.Status || 'todo'
  };
  // If Google Sheets configured, append to sheet instead of CSV
  if (SPREADSHEET_ID && process.env.GOOGLE_SHEETS_CREDENTIALS) {
    const auth = await getAuthClient({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      credentialsPath: process.env.GOOGLE_SHEETS_CREDENTIALS,
      tokenPath: process.env.GOOGLE_SHEETS_TOKEN
    });
    await sheetsAppendRow(auth, SPREADSHEET_ID, SHEET_RANGE + '!A1', [task.Task, task.Description, task.Deadline, task.Status]);
    return { success: true, appended: task, target: 'google_sheets' };
  }

  appendRow(task);
  return { success: true, appended: task };
}

module.exports = run;
