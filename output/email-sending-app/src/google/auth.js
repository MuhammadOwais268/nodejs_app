const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// Generic Google auth helper supporting either Service Account (key file) or OAuth2

function loadJson(filePath) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function getAuthClient({ scopes = [], credentialsPath, tokenPath, serviceAccountKeyPath } = {}) {
  // allow env-provided paths as defaults
  credentialsPath = credentialsPath || process.env.GOOGLE_SHEETS_CREDENTIALS || process.env.GOOGLE_OAUTH_CREDENTIALS;
  tokenPath = tokenPath || process.env.GOOGLE_SHEETS_TOKEN || process.env.GOOGLE_OAUTH_TOKEN;
  serviceAccountKeyPath = serviceAccountKeyPath || process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  // Prefer service account if provided (path or env)
  if (serviceAccountKeyPath) {
    const key = loadJson(serviceAccountKeyPath);
    if (!key) throw new Error('Service account key file not found at ' + serviceAccountKeyPath);
    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes
    });
    return auth.getClient();
  }

  const creds = loadJson(credentialsPath);
  if (!creds) {
    throw new Error('OAuth2 credentials file not found. Set GOOGLE_SHEETS_CREDENTIALS (or pass credentialsPath)');
  }

  const { client_secret, client_id, redirect_uris } = creds.installed || creds.web || {};
  if (!client_id) throw new Error('Invalid OAuth2 credentials file format');

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, (redirect_uris && redirect_uris[0]) || 'urn:ietf:wg:oauth:2.0:oob');

  // Try to load token
  if (tokenPath && fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  // If no token, throw with instructions (there is a helper script get_token.js to obtain one)
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: scopes });
  const err = new Error('No OAuth token found. Run the get_token.js helper to obtain one.\nAuth URL: ' + authUrl + '\nSave token to: ' + (tokenPath || 'tokens.json'));
  err.authUrl = authUrl;
  throw err;
}

module.exports = { getAuthClient };
