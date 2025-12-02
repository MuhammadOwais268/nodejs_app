#!/usr/bin/env bash
set -euo pipefail
# Check LLM configuration and connectivity for email-writing-app
ENV_FILE="output/email-writing-app/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "No env file at $ENV_FILE" >&2
  exit 2
fi
# load env vars from the file
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
echo "LLM config summary (from $ENV_FILE):"
echo "  USE_LLM=${USE_LLM:-}
  LLM_PROVIDER=${LLM_PROVIDER:-}
  LLM_URL=${LLM_URL:-}
  LLM_OPENAI_API_KEY=${LLM_OPENAI_API_KEY:+(present)}
  LLM_GEMINI_API_KEY=${LLM_GEMINI_API_KEY:+(present)}"

if [ "${USE_LLM:-false}" != "true" ]; then
  echo "LLM usage is disabled (USE_LLM != true)."
  exit 0
fi
rawProvider="${LLM_PROVIDER:-ollama}"
if [ "$rawProvider" = "gemini" ]; then
  echo "Configured LLM_PROVIDER=gemini but Gemini adapter has been removed from the codebase."
  echo "Please set LLM_PROVIDER=openai and LLM_OPENAI_API_KEY, or LLM_PROVIDER=ollama and configure LLM_URL."
  exit 3
fi
if [ "$rawProvider" = "openai" ]; then
  provider="openai"
else
  provider="ollama"
fi
echo "Resolved provider: $provider (raw: $rawProvider)"

if [ "$provider" = "ollama" ]; then
  llm_url="${LLM_URL:-http://localhost:11434/api/generate}"
  echo "Checking Ollama endpoint: $llm_url"
  # Small POST with timeout
  http_code=$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 5 -m 10 -X POST -H "Content-Type: application/json" -d '{"model":"llama2","prompt":"ping"}' "$llm_url" 2>/dev/null || echo "000")
  if [ "$http_code" = "000" ]; then
    echo "Ollama not reachable at $llm_url (connection failed)."
    exit 4
  fi
  echo "Ollama responded with HTTP status: $http_code"
  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo "Ollama appears reachable (success response)."
    exit 0
  else
    echo "Non-success response from Ollama (status $http_code)."
    echo "Check LLM_URL, and ensure Ollama is running and accepts /api/generate POSTs."
    exit 5
  fi
fi

if [ "$provider" = "openai" ]; then
  api_key="${LLM_OPENAI_API_KEY:-}"
  if [ -z "$api_key" ]; then
    echo "OpenAI provider selected but LLM_OPENAI_API_KEY is not set."
    exit 6
  fi
  echo "Testing OpenAI API key by calling /v1/models (no usage billed)"
  resp=$(curl -sS -o /tmp/_openai_test_resp -w "%{http_code}" -m 10 -H "Authorization: Bearer $api_key" https://api.openai.com/v1/models 2>/dev/null) || resp="000"
  http_code="$resp"
  if [ "$http_code" = "000" ]; then
    echo "Network/connection error calling OpenAI API."
    exit 7
  fi
  echo "OpenAI /v1/models returned HTTP $http_code"
  if [ "$http_code" -eq 401 ]; then
    echo "401 Unauthorized — the provided OpenAI API key is invalid or not authorized."
    exit 8
  fi
  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo "OpenAI API key appears valid (models listing successful)."
    head -n 20 /tmp/_openai_test_resp || true
    exit 0
  else
    echo "OpenAI call returned non-success status $http_code. Response excerpt:" 
    head -n 40 /tmp/_openai_test_resp || true
    exit 9
  fi
fi

# fallback
echo "No provider test executed." 
exit 10
