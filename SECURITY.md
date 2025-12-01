# Security notes

This project stores OAuth client credentials and tokens under `output/` during development.

Recommendations:

- Do NOT commit OAuth client secrets or tokens to the repository. They are sensitive and can be used to access accounts.
- Use the Orchestrator `/update-settings` API to inject secrets into running services instead of editing `.env` files in the repository.
- Add the following entries to your global gitignore if you work with multiple clones:
  - `output/**/google_*.json`
  - `.env`

Short-term actions performed by the maintainer script:
- The repo `.gitignore` now contains `output/**/google_*.json` so tokens and client secrets written to `output/` are ignored.

Long-term suggestions:
- Use a secret manager (Vault, AWS Secrets Manager, Google Secret Manager) for production deployments.
- Rotate OAuth client secrets and API keys regularly.
- Protect the Orchestrator endpoint (set `ORCH_SECRET`) and only expose it on local/internal networks.
