// Gemini adapter removed by user request.
// Keep a stub so accidental requires produce a clear error message.
module.exports = {
  callGemini: function () {
    throw new Error('Gemini adapter has been removed. Use OpenAI (set LLM_PROVIDER=openai and LLM_OPENAI_API_KEY) or Ollama (set LLM_PROVIDER=ollama and LLM_URL).');
  }
};
