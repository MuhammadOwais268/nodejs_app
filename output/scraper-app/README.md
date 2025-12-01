Scraper App

This app is a converted version of the n8n "Scraper" workflow.

Endpoints

- POST /ai-business-lookup
  - Body: { "searchQuery": "your query" }
  - Returns: JSON array of business objects (only items with website)

Env vars (see .env.example)
- PORT
- SERPAPI_KEY (required for SerpAPI requests)

Notes
- If SERPAPI_KEY is not provided the request will fail. The original n8n workflow used SerpAPI + Gemini; this converted app uses SerpAPI and performs optional website scraping to extract emails.
- Results are best-effort and depend on SerpAPI response format.
