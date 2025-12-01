#!/usr/bin/env node
/*
Helper to perform Google OAuth2 flow and save the token to ./credentials/google_token.json

Usage:
  1. Place your OAuth client JSON (the file you download from Google Cloud) at:
       ./credentials/google_oauth_client.json
  2. Install dependency: npm install googleapis
  3. Run: node tools/get_google_token.js
  4. Visit the printed URL, grant consent, paste the code back into the prompt.

This script requests scopes for Gmail send and Sheets read/write so the same token can be
used by the `email-sending` and `task-management` services. It writes the token to
./credentials/google_token.json.
*/

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const {google} = require('googleapis');

const CREDENTIALS_PATH = path.resolve(__dirname, '..', 'credentials', 'google_oauth_client.json');
const TOKEN_PATH = path.resolve(__dirname, '..', 'credentials', 'google_token.json');

async function main() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('Missing OAuth client JSON. Place it at:', CREDENTIALS_PATH);
    process.exit(2);
  }

  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  let clientJson;
  try {
    clientJson = JSON.parse(content).installed || JSON.parse(content).web || JSON.parse(content);
  } catch (err) {
    console.error('Failed to parse client JSON:', err.message);
    process.exit(2);
  }

  const clientId = clientJson.client_id;
  const clientSecret = clientJson.client_secret;
  const redirectUris = clientJson.redirect_uris || ['urn:ietf:wg:oauth:2.0:oob','http://localhost'];

  if (!clientId || !clientSecret) {
    console.error('client_id or client_secret missing in client JSON');
    process.exit(2);
  }

  const oAuth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUris[0]
  );

  // Scopes needed for Gmail send and Sheets read/write
  const SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/spreadsheets'
  ];

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });

  console.log('\n1) Open this URL in your browser and grant access:\n');
  console.log(authUrl);
  console.log('\n2) After granting access you will get a code. Paste it here.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('\nEnter the code: ', async (code) => {
    rl.close();
    try {
      const {tokens} = await oAuth2Client.getToken(code.trim());
      if (!fs.existsSync(path.dirname(TOKEN_PATH))) fs.mkdirSync(path.dirname(TOKEN_PATH), {recursive: true});
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log('\nSaved token to', TOKEN_PATH);
      console.log('Token fields (sensitive) -- keep this file private and do not commit it to git.');
      process.exit(0);
    } catch (err) {
      console.error('Error while retrieving access token', err.message || err);
      process.exit(1);
    }
  });
}

main();
