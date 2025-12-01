Google OAuth helper (for Gmail + Sheets)
========================================

This project can read Google OAuth credentials from `./credentials` to allow:
- sending via Gmail API (gmail.send)
- reading/writing Google Sheets (spreadsheets)

Quick steps to obtain credentials and token
------------------------------------------

1) Create OAuth client in Google Cloud Console
   - Go to https://console.cloud.google.com/apis/credentials
   - Create a new project or select an existing one
   - Enable the Gmail API and the Google Sheets API for the project
   - Create credentials -> OAuth client ID -> choose "Desktop app" (recommended for local dev)
   - Download the JSON and save it as:

       ./credentials/google_oauth_client.json

2) Run the helper to obtain a token
   - From the repo root run:

       npm install googleapis
       node tools/get_google_token.js

   - The script will print a URL. Open it in your browser, grant consent, and copy the code.
   - Paste the code into the terminal prompt. The script will store the token at:

       ./credentials/google_token.json

3) Restart services (orchestrator will pick them up if you use Settings)
   - After `google_oauth_client.json` and `google_token.json` are present, restart the services
     (or push spreadsheet IDs via Settings/orchestrator) so `task-management` and `email-sending`
     can use the token.

Security notes
--------------
- Do NOT commit `google_oauth_client.json` or `google_token.json` to git. Add `./credentials` to
  your `.gitignore` if it isn't already.
- Keep the token file private. It contains a `refresh_token` that can be used to obtain access tokens.

If you'd like, I can run the helper here in the environment if you upload the client JSON to
`./credentials/google_oauth_client.json` (or paste it), or I can walk you through the Google
Cloud Console steps interactively.
