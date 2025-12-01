const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// Usage:
//   export GOOGLE_SHEETS_CREDENTIALS=/path/to/creds.json
//   export GOOGLE_SHEETS_TOKEN=/path/to/save_token.json
//   node src/google/exchange_code.js <AUTH_CODE>

const CRED_PATH = process.env.GOOGLE_SHEETS_CREDENTIALS || path.join(process.env.HOME || '~', 'credentials', 'google_oauth_client.json');
const TOKEN_PATH = process.env.GOOGLE_SHEETS_TOKEN || path.join(process.env.HOME || '~', 'credentials', 'google_token.json');
const code = process.argv[2];

if (!code) {
  console.error('Provide the authorization code as the first argument.');
  process.exit(2);
}

if (!fs.existsSync(CRED_PATH)) {
  console.error('Credentials file not found at', CRED_PATH);
  process.exit(3);
}

const creds = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
const { client_secret, client_id, redirect_uris } = creds.installed || creds.web || {};
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, (redirect_uris && redirect_uris[0]) || 'urn:ietf:wg:oauth:2.0:oob');

const scopes = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose'
];

oAuth2Client.getToken(code.trim()).then(({ tokens }) => {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  console.log('Token stored to', TOKEN_PATH);
}).catch(err => {
  console.error('Error exchanging code for token:', err.message || err);
  process.exit(4);
});
