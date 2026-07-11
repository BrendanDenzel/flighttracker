/**
 * FlightTrace adsb.lol proxy — Node/Express version
 *
 * Same job as the Cloudflare Worker: guarantee CORS headers, only allow
 * a fixed set of adsb.lol v2 path prefixes, and pass through status
 * codes / Retry-After so the front end can react to real rate limits.
 *
 * Run locally:
 *   npm install
 *   npm start
 *
 * Deploy free on Render.com:
 *   1. Push this folder to a public GitHub repo.
 *   2. render.com -> New -> Web Service -> connect the repo.
 *   3. Build command: npm install   Start command: npm start   Plan: Free
 *   4. Copy the resulting https://<name>.onrender.com URL into the
 *      ADSBLOL_API constant in your HTML file.
 */

import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

const ADSBLOL_API = "https://api.adsb.lol";

const ALLOWED_PREFIXES = [
  "/v2/icao/",
  "/v2/callsign/",
  "/v2/registration/",
  "/v2/squawk/",
  "/v2/point/",
  "/v2/mil",
];

function isAllowed(path) {
  return ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(p));
}

app.use(
  cors({
    origin: "*",
    methods: ["GET", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.get(/.*/, async (req, res) => {
  const path = req.path;

  if (!isAllowed(path)) {
    return res.status(404).json({ error: "Not found" });
  }

  try {
    const upstream = new URL(ADSBLOL_API + path);
    Object.entries(req.query).forEach(([k, v]) => upstream.searchParams.set(k, String(v)));

    const upstreamRes = await fetch(upstream.toString(), {
      headers: {
        // Update the contact email — adsb.lol asks for a real User-Agent
        // so they can reach out instead of just blocking you.
        "User-Agent": "FlightTrace-personal-project (contact: youremail@example.com)",
      },
    });

    const text = await upstreamRes.text();
    const retryAfter = upstreamRes.headers.get("Retry-After");
    if (retryAfter) res.set("Retry-After", retryAfter);

    res.status(upstreamRes.status).type("application/json").send(text);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`FlightTrace proxy listening on :${PORT}`);
});
