const fs = require('fs');
const { google } = require('googleapis');

function loadJson(filePath) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function getAuthClient({ scopes = [], credentialsPath, tokenPath, serviceAccountKeyPath } = {}) {
  // allow env-provided defaults
  credentialsPath = credentialsPath || process.env.GOOGLE_SHEETS_CREDENTIALS || process.env.GOOGLE_OAUTH_CREDENTIALS;
  tokenPath = tokenPath || process.env.GOOGLE_SHEETS_TOKEN || process.env.GOOGLE_OAUTH_TOKEN;
  serviceAccountKeyPath = serviceAccountKeyPath || process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountKeyPath) {
    const key = loadJson(serviceAccountKeyPath);
    if (!key) throw new Error('Service account key file not found at ' + serviceAccountKeyPath);
    const auth = new google.auth.GoogleAuth({ credentials: key, scopes });
    return auth.getClient();
  }
  const creds = loadJson(credentialsPath);
  if (!creds) throw new Error('OAuth2 credentials file not found. Set GOOGLE_SHEETS_CREDENTIALS');
  const { client_secret, client_id, redirect_uris } = creds.installed || creds.web || {};
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, (redirect_uris && redirect_uris[0]) || 'urn:ietf:wg:oauth:2.0:oob');
  if (tokenPath && fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: scopes });
  const err = new Error('No OAuth token found. Run the get_token.js helper to obtain one. Auth URL: ' + authUrl);
  err.authUrl = authUrl;
  throw err;
}

module.exports = { getAuthClient };
