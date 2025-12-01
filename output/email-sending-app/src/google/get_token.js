/**
 * Small helper to fetch an OAuth2 token for Google APIs.
 * Usage:
 * 1. Set GOOGLE_SHEETS_CREDENTIALS to the path of your OAuth2 client credentials JSON
 * 2. Optionally set GOOGLE_SHEETS_TOKEN to where the token should be saved (default: token.json)
 * 3. Run: node src/google/get_token.js
 * 4. Open the printed URL, grant access, paste the code into the prompt
 */
const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');

const CRED_PATH = process.env.GOOGLE_SHEETS_CREDENTIALS || process.argv[2];
if (!CRED_PATH || !fs.existsSync(CRED_PATH)) {
  console.error('Provide path to OAuth2 credentials JSON via GOOGLE_SHEETS_CREDENTIALS env or as first arg');
  process.exit(1);
}
const TOKEN_PATH = process.env.GOOGLE_SHEETS_TOKEN || process.argv[3] || 'token.json';
const scopes = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose'
];

const creds = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
const { client_secret, client_id, redirect_uris } = creds.installed || creds.web || {};
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, (redirect_uris && redirect_uris[0]) || 'urn:ietf:wg:oauth:2.0:oob');

const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: scopes });
console.log('Authorize this app by visiting this url:\n', authUrl);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Enter the code from that page here: ', (code) => {
  rl.close();
  oAuth2Client.getToken(code.trim()).then(({ tokens }) => {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log('Token stored to', TOKEN_PATH);
  }).catch(err => {
    console.error('Error while retrieving access token', err.message);
  });
});
