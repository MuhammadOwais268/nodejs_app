// Gemini adapter updated to use the gemini-2.0-flash generateContent endpoint.
// Returns plain text extracted from candidates[].content.parts[].text when available.
const axios = require('axios');

async function callGemini(prompt, model = null, apiKey = null, timeout = 30000) {
  // Prefer explicit URL if set, otherwise use gemini flash endpoint.
  const configured = process.env.LLM_GEMINI_URL;
  const url = configured || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  const headers = { 'Content-Type': 'application/json' };
  // Use X-goog-api-key header when an API key is provided (works reliably for Gemini endpoints)
  if (apiKey) headers['X-goog-api-key'] = apiKey;

  // Build payload in the 'contents.parts.text' shape expected by newer Gemini endpoints.
  const body = { contents: [{ parts: [{ text: prompt }] }] };

  try {
    const resp = await axios.post(url, body, { headers, timeout });
    if (!resp || !resp.data) throw new Error('empty_response_body');
    const d = resp.data;

    // Try known response shapes: candidates[].content.parts[].text
    if (d.candidates && Array.isArray(d.candidates) && d.candidates.length) {
      const first = d.candidates[0];
      if (first.content && first.content.parts && Array.isArray(first.content.parts)) {
        const parts = first.content.parts.map(p => (p && p.text) ? String(p.text) : '').filter(Boolean);
        if (parts.length) return parts.join('\n');
      }
      // older shapes
      if (first.content && typeof first.content === 'string') return first.content;
      if (first.output && typeof first.output === 'string') return first.output;
    }

    // fallback: try other shapes
    if (d.output && typeof d.output === 'string') return d.output;
    if (d.generations && Array.isArray(d.generations) && d.generations[0] && d.generations[0].text) return d.generations[0].text;

    // Last resort: stringify whole response
    return JSON.stringify(d);
  } catch (err) {
    if (err && err.response) {
      console.error('[gemini-debug] status=', err.response.status, 'body=', JSON.stringify(err.response.data || ''));
      // Repackage certain status codes into friendly error messages the workflow understands
      if (err.response.status === 404) {
        const e = new Error('gemini_404');
        e.response = err.response;
        throw e;
      }
    } else {
      console.error('[gemini-debug] error=', err && err.message ? err.message : err);
    }
    throw err;
  }
}

module.exports = { callGemini };
