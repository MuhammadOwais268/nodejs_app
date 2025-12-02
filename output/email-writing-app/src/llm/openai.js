const axios = require('axios');

async function callOpenAI(prompt, model, apiKey, timeout = 30000) {
  if (!apiKey) throw new Error('OpenAI API key not set (LLM_OPENAI_API_KEY)');
  const url = process.env.LLM_OPENAI_URL || 'https://api.openai.com/v1/chat/completions';
  const body = {
    // Use a widely-available chat model by default to avoid endpoint/model mismatches.
    model: model || process.env.LLM_OPENAI_MODEL || 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 800,
    temperature: 0.7
  };
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };
  const resp = await axios.post(url, body, { headers, timeout });
  if (!resp || !resp.data) throw new Error('Empty response from OpenAI');
  // Try to extract assistant message
  const choices = resp.data.choices || [];
  if (choices.length === 0) return resp.data;
  const msg = choices[0].message?.content || choices[0].text || '';
  return msg;
}

module.exports = { callOpenAI };

  // Enhanced error debugging: wrap exports with a helper that logs error responses when present.
  const original = module.exports.callOpenAI;
  module.exports.callOpenAI = async function(prompt, model, apiKey, timeout = 30000) {
    try {
      return await original(prompt, model, apiKey, timeout);
    } catch (err) {
      try {
        if (err.response) {
          console.error('[openai-debug] status=', err.response.status, 'data=', JSON.stringify(err.response.data || ''));
        } else {
          console.error('[openai-debug] error=', err.message || err);
        }
      } catch (e) { console.error('[openai-debug] failed to print error', e); }
      throw err;
    }
  };
