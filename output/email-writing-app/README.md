Email Writing App

Converted from the n8n "Email_Writing" workflow.

Endpoints

- POST /email_writting
  - Body: { subject, body }
  - Returns: JSON array of generated personalized emails (email_id, recipient, subject, body)

Behavior
- This simplified converter will read rows from a local CSV (DATA_CSV) if present and generate personalized emails by substituting recipient name/placeholders into the provided subject/body.
- The original workflow relied on AI (Gemini); this converter uses a simple template-based personalization.
