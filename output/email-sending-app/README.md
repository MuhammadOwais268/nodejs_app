Email Sending App

Converted from the n8n "Email_Sending" workflow.

Endpoints

- POST /email_management
  - Body should include: { recipient_email, subject, body, email_id }
  - The app will attempt to send an email (via SMTP if configured) and persist a record to data.csv (or Google Sheets if you implement that)

Env vars
- PORT
- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (optional; if missing emails are logged instead of sent)

Notes
- Gmail OAuth2 integration from the original workflow is not implemented here. Use SMTP env vars for sending or extend the code to add Google OAuth2.
