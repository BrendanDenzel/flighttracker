// Simple ADS-B proxy server
// Fetches data from adsb.lol server-side (avoids browser CORS issues)
// and caches responses briefly to avoid hammering the upstream API.

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// How long to cache each response, in milliseconds.
// ADS-B positions don't meaningfully change faster than a few seconds,
// so this drastically cuts down on requests to adsb.lol.
const CACHE_TTL_MS = 5000;

const cache = new Map(); // key: request path, value: { data, expiresAt }

// Allow requests from any origin. If you want to lock this down to
// just your own site later, replace '*' with your domain, e.g.
// cors({ origin: 'https://yoursite.com' })
app.use(cors());

// Generic proxy handler for any adsb.lol v2 endpoint.
// Example usage from your frontend:
//   GET https://your-server-address/api/v2/callsign/UAL1310
//   GET https://your-server-address/api/v2/point/33.94/-118.40/50
app.get('/api/*', async (req, res) => {
  const upstreamPath = req.params[0]; // everything after /api/
  const cacheKey = upstreamPath;

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.data);
  }

  try {
    const upstreamUrl = `https://api.adsb.lol/${upstreamPath}`;
    const response = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'my-flight-tracker-app/1.0 (contact: you@example.com)'
      }
    });

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Upstream returned ${response.status}` });
    }

    const data = await response.json();
    cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    res.json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(502).json({ error: 'Failed to reach adsb.lol' });
  }
});

app.get('/', (req, res) => {
  res.send('ADS-B proxy is running. Try /api/v2/callsign/SOMECALLSIGN');
});

app.listen(PORT, () => {
  console.log(`ADS-B proxy listening on port ${PORT}`);
});
