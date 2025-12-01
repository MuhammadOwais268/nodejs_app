require('dotenv').config();
const express = require('express');
const bodyParser = require('express').json;
const cors = require('cors');
const run = require('./workflow');

const app = express();
app.use(bodyParser());
app.use(cors());

app.post('/Sheet_management', async (req, res) => {
  try {
    const result = await run(req.body);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// New: batch append endpoint to accept an array of tasks and append them in one request.
app.post('/Sheet_management/batch', async (req, res) => {
  try {
    const body = req.body;
    if (!Array.isArray(body)) return res.status(400).json({ error: 'Expected an array of tasks' });

    const results = [];
    for (const item of body) {
      try {
        const r = await run(item);
        results.push({ success: true, result: r });
      } catch (err) {
        console.error('Batch append item failed:', err && err.message ? err.message : err);
        results.push({ success: false, error: err && err.message ? err.message : String(err) });
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

const port = process.env.PORT || 3004;
app.listen(port, () => console.log(`Task management app listening on ${port}`));
