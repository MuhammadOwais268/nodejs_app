require('dotenv').config();
const express = require('express');
const bodyParser = require('express').json;
const cors = require('cors');
const run = require('./workflow');

const app = express();
app.use(bodyParser());
app.use(cors());

app.post('/email_writting', async (req, res) => {
  try {
    const result = await run(req.body);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

const port = process.env.PORT || 3003;
app.listen(port, () => console.log(`Email writing app listening on ${port}`));
