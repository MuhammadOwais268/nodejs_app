const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// Usage: set CREDENTIALS_PATH env var or edit the default path below
const defaultCreds = path.join(process.env.HOME || '~', 'Downloads', 'client_secret_2_1002277271337-v24oates5ql8aikpvpbtocqb7kgqft39.apps.googleusercontent.com.json');
const CREDENTIALS_PATH = process.env.CREDENTIALS_PATH || defaultCreds;

if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error('Credentials file not found at', CREDENTIALS_PATH);
  process.exit(2);
}

const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
const creds = JSON.parse(raw).installed || JSON.parse(raw).web || JSON.parse(raw);
const { client_secret, client_id, redirect_uris } = creds;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris && redirect_uris[0]);

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.send',
];

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('Open this URL in your browser and paste the code back into the helper to store tokens:');
console.log(authUrl);
