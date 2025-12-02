# Business Email JS — Converted n8n Workflows

This repository contains four small Node.js microservices converted from n8n workflows. Each app reproduces a single workflow and can run independently or together. The repository includes helpers for Google Sheets and Gmail (OAuth2), a verification script, and example scripts to run end-to-end flows.

This README documents everything you need to run, test, and operate the apps in a professional production-friendly manner.

## Project layout

- `output/`
  - `scraper-app/` — Scrapes business data via SerpAPI and scrapes website pages for emails.
  - `email-sending-app/` — Sends emails (SMTP or Gmail API) and persists sent records.
  - `email-writing-app/` — Generates personalized emails from a data source (Sheets or CSV).
  - `task-management-app/` — Read/append/clear operations against a Google Sheet (task list).

Each app contains `package.json`, a `src/` folder with the conversion of the workflow, `.env.example`, and a small Express server (`src/app.js`).

Paths used during conversion and runtime (examples):

- App sources: `output/<app-name>/src/`
- App `.env` files: `output/<app-name>/.env` (created/updated by the assistant)
- Google credentials & token: `/home/owais/credentials/google_oauth_client.json` and `/home/owais/credentials/google_token.json`

## High-level contract

Each app exposes a small JSON HTTP API:

- Scraper: POST /ai-business-lookup (body: `{ searchQuery }`) -> array of businesses
- Email writing: POST /email_writting (body: `{ subject, body, [data] }`) -> generated messages
- Email sending: POST /email_management (body: `{ recipient_email, subject, body, email_id }`) -> send result
- Task management: POST /Sheet_management (body depends on workflow) -> Sheets operation result

Health endpoints: GET /health on each app.

All apps default to localhost ports 3001–3004 (see each app `src/app.js`).

## Prerequisites

- Node.js 18+ installed
- npm (or yarn)
- A Google Cloud project with the following APIs enabled:
  - Google Sheets API
  - Gmail API (if you want to send via Gmail)

Optional:
- SerpAPI account & API key (for `scraper-app`).

## Google OAuth setup (one-time)

This project supports two Google auth modes:

1) OAuth2 (user consent) — recommended for Gmail send as it allows sending as the user.
2) Service account — useful for server-to-server Sheets access (not for Gmail send unless domain-wide delegation is configured).

We implemented a small interactive helper and non-interactive exchange helper under `output/email-sending-app/src/google/` to obtain tokens.

Steps (OAuth2 client):

1. In the Google Cloud console, create a project (or use an existing one).
2. Enable the *Google Sheets API* and *Gmail API*.
3. Create OAuth 2.0 Client Credentials (Desktop or Web). Recommended: "Desktop" or "Other" for a simple flow.
4. Download the JSON credentials and copy it to the machine where apps run. Example location used by this project:

```bash
mkdir -p /home/owais/credentials
cp ~/Downloads/client_secret_*.json /home/owais/credentials/google_oauth_client.json
chmod 600 /home/owais/credentials/google_oauth_client.json
```

5. Generate a consent/authorization URL and obtain the one-time code.

Interactive (recommended):

```bash
cd output/email-sending-app
export GOOGLE_SHEETS_CREDENTIALS=/home/owais/credentials/google_oauth_client.json
export GOOGLE_SHEETS_TOKEN=/home/owais/credentials/google_token.json
node src/google/get_token.js
# Open the printed URL in your browser, consent, copy the code and paste into the prompt.
```

Non-interactive (exchange a code):

If you prefer to paste the code into a single command (or have CI do it), there is a small helper:

```bash
cd output/email-sending-app
export GOOGLE_SHEETS_CREDENTIALS=/home/owais/credentials/google_oauth_client.json
export GOOGLE_SHEETS_TOKEN=/home/owais/credentials/google_token.json
node src/google/exchange_code.js 'PASTE_AUTH_CODE_HERE'
```

After success you will have `/home/owais/credentials/google_token.json` containing the OAuth tokens (access & refresh). Keep this file protected.

## Environment variables (per-app)

Each app reads a `.env` file in its folder (we added `.env` files for convenience). Below are commonly used variables. See `output/<app>/src` for implementation-specific envs.

Common (all apps):

- `GOOGLE_SHEETS_CREDENTIALS` — path to OAuth client JSON (example `/home/owais/credentials/google_oauth_client.json`)
- `GOOGLE_SHEETS_TOKEN` — path where tokens are stored (example `/home/owais/credentials/google_token.json`)
- `SPREADSHEET_ID` — default spreadsheet ID used by the app (where relevant)
- `PORT` — HTTP server port (default per app in code)

email-sending-app specific:

- `USE_GMAIL_API` — `true` to use Gmail API instead of SMTP
- `GMAIL_FROM` — optional from address for Gmail API (default `me`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — SMTP fallback configuration

email-writing-app specific:

- `GOOGLE_SHEETS_SPREADSHEET_ID` — sheet to read rows from
- `GOOGLE_SHEETS_RANGE` — sheet range (default `Sheet1`)
- `DATA_CSV` — local fallback CSV file path (default `data.csv` in the app folder)

LLM / Writer (new additions)

- `USE_LLM` — set to `true` to enable LLM-based personalized previews (defaults present in `output/email-writing-app/.env`).
- `LLM_PROVIDER` — one of `openai`, `gemini`, or `ollama`. The writer will try the configured provider then fall back to other configured providers before using deterministic templates.
- `LLM_OPENAI_API_KEY` — OpenAI API key (kept out of `.env` by orchestrator; stored in `output/orchestrator/secrets.json`).
- `LLM_GEMINI_API_KEY` — Google API key for Generative API (kept in orchestrator secrets). If you have access to Gemini models, use this key.
- `LLM_GEMINI_URL` — (optional) override URL for Gemini endpoints. Recent default points to `gemini-2.0-flash` generateContent endpoint which is known to work for many keys:
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`

Notes:
- The code contains provider adapters under `output/email-writing-app/src/llm/`:
  - `openai.js` — OpenAI adapter (defaults to `gpt-3.5-turbo` for safety)
  - `gemini.js` — Google Generative adapter (uses the flash `generateContent` shape and `X-goog-api-key` header)
  - `ollama` support is available via `LLM_URL` if you host a local LLM.

If an LLM provider is unavailable (quota, 404, or auth), the writer falls back to deterministic templating so previews and the UI remain usable.

scraper-app specific:

- `SERPAPI_KEY` — SerpAPI key if you want remote scraping

task-management-app specific:

- `SPREADSHEET_ID` — sheet to read/append/clear tasks

The assistant added example `.env` files at:

- `output/email-sending-app/.env`
- `output/email-writing-app/.env`
- `output/scraper-app/.env`
- `output/task-management-app/.env`

Edit those to change spreadsheet IDs, ports, default recipients, or to enable/disable Gmail API.

## Running the apps

Install dependencies (if not already):

```bash
cd output/email-sending-app && npm install
cd ../email-writing-app && npm install
cd ../scraper-app && npm install
cd ../task-management-app && npm install
```

Start each app (foreground):

```bash
# Scraper
cd output/scraper-app && node src/app.js

# Email sending
cd output/email-sending-app && node src/app.js

# Email writing
cd output/email-writing-app && node src/app.js

# Task management
cd output/task-management-app && node src/app.js
```

Or start them in background (we used `nohup` when validating):

```bash
cd output/email-sending-app && nohup node src/app.js > server.log 2>&1 &
```

Check `server.log` in each app folder for runtime logs.

## Calling the APIs (examples)

Health checks:

```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health
```

Scraper example:

```bash
curl -X POST http://localhost:3001/ai-business-lookup \
  -H 'Content-Type: application/json' \
  -d '{"searchQuery":"coffee shops near Islamabad"}'
```

Email writing example:

```bash
curl -X POST http://localhost:3003/email_writting \
  -H 'Content-Type: application/json' \
  -d '{"subject":"Hello [NAME]","body":"Hi [NAME], we found your website at {{email}}"}'
```

Email sending example:

```bash
curl -X POST http://localhost:3002/email_management \
  -H 'Content-Type: application/json' \
  -d '{"recipient_email":"user@example.com","subject":"Test","body":"Hello from the app","email_id":"test-1"}'
```

Task management example (append row):

```bash
curl -X POST http://localhost:3004/Sheet_management \
  -H 'Content-Type: application/json' \
  -d '{"action":"append","row":["task1","owner","2025-12-01"]}'
```

End-to-end (generate then send) — preview mode (dry-run):

```bash
# 1) Generate messages and save
curl -sS -X POST http://localhost:3003/email_writting -H 'Content-Type: application/json' -d '{"subject":"Hi [NAME]","body":"Hello [NAME]"}' > /tmp/gen.json

# 2) Preview recipients
jq -r '.[] | "\(.recipient) — \(.subject)"' /tmp/gen.json

# 3) Send each message (remove echo to actually send):
cat /tmp/gen.json | jq -c '.[]' | while read -r m; do
  to=$(echo "$m" | jq -r '.recipient')
  sub=$(echo "$m" | jq -r '.subject')
  body=$(echo "$m" | jq -r '.body')
  id=$(echo "$m" | jq -r '.email_id')
  echo curl -X POST http://localhost:3002/email_management -H 'Content-Type: application/json' -d '{"recipient_email":"'$to'","subject":"'$sub'","body":"'$body'","email_id":"'$id'"}'
done
```

Note: `jq` is used for JSON parsing; install via your package manager if needed.

## Changing spreadsheet IDs, default recipient, or ports

Edit the `.env` file in the corresponding app and restart the app. Example change the email-sending spreadsheet ID and default recipient:

```bash
# edit output/email-sending-app/.env
SPREADSHEET_ID=NEW_SHEET_ID
TEST_RECIPIENT=you@domain.com

# restart the app (example using nohup background restart)
pkill -f 'node src/app.js' || true
cd output/email-sending-app && nohup node src/app.js > server.log 2>&1 &
```

## Verification script

A verification helper was added at `output/email-sending-app/src/google/verify_and_send.js`. It uses the saved token and client to:

- Append a verification row to the Email-sending sheet
- Append a verification row to the Task-management sheet
- Send a short verification email via Gmail API

Run it like this:

```bash
cd output/email-sending-app
export GOOGLE_SHEETS_CREDENTIALS=/home/owais/credentials/google_oauth_client.json
export GOOGLE_SHEETS_TOKEN=/home/owais/credentials/google_token.json
export SPREADSHEET_EMAIL_ID=1TNLk...   # email-sending sheet id
export SPREADSHEET_TASK_ID=1B81E...    # task sheet id
export TEST_RECIPIENT=you@domain.com
node src/google/verify_and_send.js
```

## Logs and troubleshooting

- App logs: `output/<app>/server.log` (if started with `nohup`) or stdout when running in foreground.
- Common errors:
  - `invalid_grant` during token exchange — code expired or already used. Re-run authorization and exchange a fresh code.
  - Permission errors with Sheets/Gmail — confirm the token was created with the correct scopes (`sheets`, `gmail.send`).
  - Missing `googleapis` module — run `npm install` in the app folder.

If Gmail sends fail, check the token validity and re-run `get_token.js`.

## Security & best practices

- Keep `/home/owais/credentials` private and accessible only to the runtime user (we set `chmod 600`).
- Do not commit credentials or token files to source control.
- For production consider using a secrets manager (HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager) and rotating credentials regularly.
- Consider running these apps behind a reverse proxy (nginx) and add HTTPS/TLS in front of them.

## Next steps & improvements

- Add automated unit/integration tests for the Google helpers and key workflows.
- Add retry/backoff logic and error handling around external calls (Sheets, Gmail, SerpAPI).
- Replace CSV fallbacks with a local DB (SQLite) for reliability.
- Add metrics and health/readiness endpoints for orchestration (k8s/systemd).

## Orchestrator LLM test endpoint and Settings UI

To make it easy to validate LLM API keys (Google Gemini or OpenAI) without restarting containers or editing `.env` files, the orchestrator now exposes a small test endpoint and the frontend Settings UI includes a "Test LLM Key" button.

- Orchestrator API: POST `/api/test-llm`
  - Body: `{ provider: 'gemini'|'openai', apiKey: '<key>', testPrompt?: '<prompt>', url?: '<override>' }`
  - Returns: `{ ok: boolean, status: number, body: '<raw provider response>' }` — the orchestrator proxies a short provider request and returns the raw response for inspection.
  - Requires header `x-orch-secret` when `ORCH_SECRET` is set (local default in docker-compose is `dev_orch_secret`).

- Frontend Settings: open `Settings` and use the **Test LLM Key** button in the Keys & IDs section.
  - The UI sends the provider and key to `/api/test-llm` and displays the raw provider JSON for quick validation.
  - To have the Settings UI changes appear in the running container, rebuild the frontend image (instructions below).

This workflow makes it fast to troubleshoot key permission issues (404 responses from Google usually mean Generative API is not enabled or the key is restricted). The orchestrator will also persist provider secrets into `output/orchestrator/secrets.json` when you save settings.

## Useful files

- `output/email-sending-app/src/google/get_token.js` — interactive OAuth helper
- `output/email-sending-app/src/google/exchange_code.js` — non-interactive exchange helper
- `output/email-sending-app/src/google/gen_auth_url.js` — prints auth URL from the app context
- `output/email-sending-app/src/google/verify_and_send.js` — verification script (appends to sheets + sends email)

## Contact & support

If you want, I can:

- Wire these `.env` settings into systemd unit files or Docker Compose for production.
- Add a single `run_all.sh` script to call the full workflow (scrape → write → send) with a dry-run mode.
- Harden logging, add tests, and prepare a deployable Docker image per app.

Tell me which of the next steps you'd like me to implement and I will continue.

---
# Changes in this branch (high level)

- Added Gemini flash adapter and LLM fallback chain in `output/email-writing-app/src/`.
- Added robust Gemini adapter `gemini.js` which calls `gemini-2.0-flash:generateContent` and extracts text from `candidates[].content.parts[].text`.
- Improved `workflow.js` JSON-extraction robustness to handle model outputs with wrapped JSON.
- Orchestrator now exposes a small test endpoint `/api/test-llm` to validate LLM keys.
- Frontend Settings UI now includes a "Test LLM Key" button that calls the orchestrator test endpoint.
- Orchestrator persists sensitive keys to `output/orchestrator/secrets.json` and writes non-sensitive settings into per-app `.env` files.

Generated: December 03, 2025
# nodejs_app
