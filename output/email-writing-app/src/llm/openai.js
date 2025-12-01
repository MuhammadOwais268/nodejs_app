const axios = require('axios');

async function callOpenAI(prompt, model, apiKey, timeout = 30000) {
  if (!apiKey) throw new Error('OpenAI API key not set (LLM_OPENAI_API_KEY)');
  const url = process.env.LLM_OPENAI_URL || 'https://api.openai.com/v1/chat/completions';
  const body = {
    model: model || process.env.LLM_OPENAI_MODEL || 'gpt-4o-mini',
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
