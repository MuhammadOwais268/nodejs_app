require('dotenv').config();
const express = require('express');
const bodyParser = require('express').json;
let cors;
try {
  cors = require('cors');
} catch (e) {
  // If `cors` isn't installed in the environment (some container builds),
  // fall back to a tiny middleware that sets permissive CORS headers.
  console.warn('Optional dependency "cors" not found — using lightweight fallback');
  cors = () => (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}
const run = require('./workflow');

const app = express();
app.use(bodyParser());
app.use(cors());

// Startup log with masked env info
const port = process.env.PORT || 3001;
const hasSerpKey = !!process.env.SERPAPI_KEY;
console.log(`Scraper startup: listening on ${port} | SERPAPI_KEY set: ${hasSerpKey ? 'YES' : 'NO'}`);

// Health endpoint
app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

// Main scraping endpoint with request/response logging
app.post('/ai-business-lookup', async (req, res) => {
  const receivedAt = new Date().toISOString();
  const remote = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
  try {
    console.log(`[scraper] request received at ${receivedAt} from ${remote}`);
    // Log body but avoid printing secrets; mask keys if present
    const safeBody = { ...req.body };
    if (safeBody.SERPAPI_KEY) safeBody.SERPAPI_KEY = '***MASKED***';
    console.debug('[scraper] request body:', JSON.stringify(safeBody));

    const result = await run(req.body);

    console.log(`[scraper] request completed at ${new Date().toISOString()} — returned ${Array.isArray(result) ? result.length : typeof result}`);
    res.json(result);
  } catch (err) {
    console.error('[scraper] request error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.listen(port, () => console.log(`Scraper app listening on ${port}`));
