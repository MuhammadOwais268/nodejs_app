const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SERPAPI_KEY = process.env.SERPAPI_KEY;

function makeRequestId() {
  return Date.now().toString();
}

// helper to normalize Google redirect URLs like "/url?q=https://example.com/..."
function normalizeWebsiteUrl(u) {
  if (!u) return '';
  try {
    u = String(u).trim();
    // If SerpAPI returned a Google redirect path (/url?q=...), extract the q param
    if (u.startsWith('/url?q=')) {
      const qs = u.split('?')[1] || '';
      const params = new URLSearchParams(qs);
      const q = params.get('q') || '';
      if (q) return decodeURIComponent(q.split('#')[0]);
    }
    // If it contains '/url?q=' somewhere, try to extract
    const m = u.match(/\/url\?q=([^&]+)/);
    if (m && m[1]) return decodeURIComponent(m[1]);
    return u;
  } catch (e) { return u; }
}

async function callSerpapi(searchQuery, requestId, timestamp) {
  if (!SERPAPI_KEY) throw new Error('SERPAPI_KEY is required in environment');
  const url = 'https://serpapi.com/search.json';
  console.log(`[scraper.workflow] [${requestId}] Calling SerpAPI for query="${searchQuery}" at ${timestamp}`);
  try {
    const res = await axios.get(url, {
      params: {
        engine: 'google_maps',
        q: searchQuery,
        hl: 'en',
        api_key: SERPAPI_KEY
      },
      timeout: 20000
    });
    console.log(`[scraper.workflow] [${requestId}] SerpAPI responded status=${res.status}`);
    return res.data;
  } catch (err) {
    console.error(`[scraper.workflow] [${requestId}] SerpAPI request failed:`, err && err.message ? err.message : err);
    throw err;
  }
}

function extractBusinessesFromSerpapi(result, requestId, timestamp) {
  // SerpAPI responses vary by engine/version. We'll try to extract a few common fields.
  const out = [];
  const places = result['local_results'] || result['local_results'] || result['organic_results'] || result['place_results'] || result['places'] || [];

  // Common property where serpapi returns place results: 'local_results' or 'local_results' key
  // Fall back: look for arrays of objects under known keys
  const candidates = [];
  if (Array.isArray(result.local_results)) candidates.push(...result.local_results);
  if (Array.isArray(result.places)) candidates.push(...result.places);
  if (Array.isArray(result.organic_results)) candidates.push(...result.organic_results);
  if (Array.isArray(result['search_results'])) candidates.push(...result['search_results']);

  // If none found, try top-level arrays
  if (candidates.length === 0) {
    for (const k of Object.keys(result)) {
      if (Array.isArray(result[k]) && result[k].length > 0 && typeof result[k][0] === 'object') candidates.push(...result[k]);
    }
  }

  console.log(`[scraper.workflow] [${requestId}] candidate items: ${candidates.length}`);
  // Try to map fields from candidate items
  for (const i of candidates) {
    let website = i.website || i.url || i.link || (i.rich_snippet && i.rich_snippet.top && i.rich_snippet.top.link);
    website = normalizeWebsiteUrl(website);
    if (!website) continue; // original workflow keeps only with website
    const name = i.title || i.name || i.place_name || i.name || null;
    const location = (i.address || i.formatted_address || i.address_string || i.location) || null;
    const phone = i.phone || i.phone_number || null;
    const rating = (i.rating !== undefined) ? i.rating : (i.ratings ? i.ratings : null);

    out.push({
      id: requestId,
      s_no: out.length + 1,
      timestamp,
      name,
      type: i.type || i.category || null,
      location,
      phone,
      website,
      emails: '', // will be filled by scraping step (comma-separated)
      rating,
      hasEmails: false,
      priority: 2 // default priority (2 = no emails found). Lower number => higher priority
    });
  }

  console.log(`[scraper.workflow] [${requestId}] extracted businesses: ${out.length}`);

  return out;
}

// Best-effort email extraction. If SCRAPER_USE_HEADLESS=true, attempt to render the page
// with a headless browser (Puppeteer) so JS-injected emails can be discovered.
async function scrapeWebsiteForEmails(url) {
  const useHeadless = (String(process.env.SCRAPER_USE_HEADLESS || '').toLowerCase() === 'true');
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(?!jpeg|jpg|png|gif|webp|svg)[a-zA-Z]{2,}/g;

  if (useHeadless) {
    // Try to require puppeteer lazily so environments without it won't crash until used.
    let puppeteer;
    let launchOpts = { args: ['--no-sandbox', '--disable-setuid-sandbox'], defaultViewport: { width: 1200, height: 800 } };
    try {
      // Prefer full puppeteer (bundles Chromium). If not installed, try puppeteer-core
      // with an executable path provided via PUPPETEER_EXECUTABLE_PATH.
      try {
        puppeteer = require('puppeteer');
      } catch (e) {
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
          puppeteer = require('puppeteer-core');
          launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
          console.info('[scraper.workflow] Using puppeteer-core with executable at', launchOpts.executablePath);
        } else {
          console.warn('[scraper.workflow] SCRAPER_USE_HEADLESS=true but puppeteer not installed and no PUPPETEER_EXECUTABLE_PATH provided. Falling back to HTTP fetch.');
          return scrapeWebsiteForEmailsSimple(url, regex);
        }
      }

      const browser = await puppeteer.launch(launchOpts);
      const page = await browser.newPage();
      // set a reasonable timeout and user agent
      await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      // allow short additional time for JS to insert content
      await page.waitForTimeout(800);
      const text = await page.content();
      try { await page.close(); } catch (e) {}
      try { await browser.close(); } catch (e) {}
      const matches = text.match(regex);
      return matches ? Array.from(new Set(matches)) : [];
    } catch (err) {
      console.warn('[scraper.workflow] Headless fetch failed for', url, err && err.message ? err.message : err);
      // fall back to simple fetch
      return scrapeWebsiteForEmailsSimple(url, regex);
    }
  }

  return scrapeWebsiteForEmailsSimple(url, regex);
}

// Simple HTTP fetch email extractor (existing behavior extracted to helper)
async function scrapeWebsiteForEmailsSimple(url, regex) {
  try {
    const res = await axios.get(url, { timeout: 10000, maxRedirects: 3 });
    const text = res.data || '';
    const matches = text.match(regex);
    return matches ? Array.from(new Set(matches)) : [];
  } catch (err) {
    // ignore site errors
    return [];
  }
}

async function run(input) {
  // Expect input: { searchQuery }
  const searchQuery = input.searchQuery || (input.body && input.body.searchQuery);
  if (!searchQuery) throw new Error('searchQuery is required');
  const requestId = makeRequestId();
  const timestamp = new Date().toISOString();

  console.log(`[scraper.workflow] [${requestId}] run started for query="${searchQuery}"`);
  let serp;
  try {
    serp = await callSerpapi(searchQuery, requestId, timestamp);
  } catch (err) {
    console.error(`[scraper.workflow] [${requestId}] callSerpapi error:`, err && err.message ? err.message : err);
    throw err;
  }

  const businesses = extractBusinessesFromSerpapi(serp, requestId, timestamp);

  // For each business, optionally fetch website and extract emails (best-effort)
  for (const b of businesses) {
    if (b.website) {
      try {
        console.log(`[scraper.workflow] [${requestId}] scraping site for emails: ${b.website}`);
        const emails = await scrapeWebsiteForEmails(b.website);
        b.emails = emails && emails.length ? emails.join(',') : '';
        b.hasEmails = Array.isArray(emails) && emails.length > 0;
        b.priority = b.hasEmails ? 1 : 2;
        console.log(`[scraper.workflow] [${requestId}] found ${emails.length} emails at ${b.website}`);
      } catch (err) {
        console.warn(`[scraper.workflow] [${requestId}] failed to scrape ${b.website}:`, err && err.message ? err.message : err);
        b.emails = '';
        b.hasEmails = false;
        b.priority = 2;
      }
    } else {
      b.emails = '';
      b.hasEmails = false;
      b.priority = 2;
    }
  }

  

  // Optionally persist to data.csv if no Google Sheets configured
  try {
    const outPath = path.join(process.cwd(), 'data.csv');
    const exists = fs.existsSync(outPath);
    // Sort businesses so those with emails come first, then by rating desc as secondary sort
    businesses.sort((a,b) => {
      if ((a.priority||2) !== (b.priority||2)) return (a.priority||2) - (b.priority||2);
      const ra = Number(a.rating||0), rb = Number(b.rating||0);
      return rb - ra;
    });

    const header = 'id,s_no,timestamp,name,type,location,phone,emails,website,rating,hasEmails,priority\n';
    const rows = businesses.map(r => `${r.id},${r.s_no},"${r.timestamp}","${(r.name||'').replace(/"/g,'""')}","${(r.type||'').replace(/"/g,'""')}","${(r.location||'').replace(/"/g,'""')}","${(r.phone||'').replace(/"/g,'""')}","${(r.emails||'').replace(/"/g,'""')}","${(r.website||'').replace(/"/g,'""')}",${r.rating || 0},${r.hasEmails?1:0},${r.priority || 2}\n`).join('');
    if (!exists) fs.writeFileSync(outPath, header + rows);
    else fs.appendFileSync(outPath, rows);
    console.log(`[scraper.workflow] [${requestId}] persisted ${businesses.length} rows to data.csv`);
  } catch (err) {
    // non-fatal
    console.warn('[scraper.workflow] Failed to persist CSV:', err && err.message ? err.message : err);
  }

  return businesses;
}

module.exports = run;
