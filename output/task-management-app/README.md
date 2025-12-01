Task Management App

Converted from the n8n "Task management agent (with Google Sheets)" workflow.

Endpoints

- POST /Sheet_management
  - Body: { action: 'Get'|'Clear'|other, ...payload }
  - - If action contains 'Clear' -> clears the sheet (in this simplified app, clears the DATA_CSV)
  - - If action contains 'Get' -> returns rows from DATA_CSV
  - - Otherwise -> appends the provided task fields to DATA_CSV

Env vars
- PORT
- DATA_CSV (path to local CSV used if Google Sheets is not configured)

Notes
- Google Sheets integration is not implemented in this quick conversion. Data is persisted in a local CSV.
