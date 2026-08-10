// Emoji Catch - Leaderboard + private play-analytics Worker (Cloudflare)
// Bind a KV namespace to this Worker with the variable name: LEADERBOARD
//
// Routes:
//   GET  /                 -> top 20 scores (public): [{ name, score }]
//   POST /                 -> body { name, score, id }; add/update a score
//   POST /event            -> body { type:"start"|"end", ms, id }; anonymous stats
//   GET  /stats?key=XXXX   -> private stats dashboard (HTML; add &format=json for JSON)
//
// Privacy: the stats store ONLY anonymous daily totals - no names, emails, or
// IPs. Device ids are hashed before being counted for "unique players".

const MAX_SCORE = 100000;
const KEEP = 200;
const TOP = 20;
const MIN_GAP_MS = 3000;
const BAD = ["badword", "swear1", "swear2"];
const STATS_KEY = "laylah";   // change this (or set a STATS_KEY env var) to keep /stats private
const STATS_DAYS = 14;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function cleanName(raw) {
  let name = String(raw || "Player").slice(0, 14).replace(/[^a-zA-Z0-9 _-]/g, "").trim();
  if (!name) name = "Player";
  const low = name.toLowerCase();
  for (const w of BAD) if (low.includes(w)) return "Player";
  return name;
}
async function hashHex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ec-salt:" + str));
  return [...new Uint8Array(buf)].slice(0, 8).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}
function today() { return new Date().toISOString().slice(0, 10); }
const publicView = function (b) { return b.slice(0, TOP).map(function (e) { return { name: e.name, score: e.score }; }); };
const keyOf = function (e) { return e.id ? "id:" + e.id : "nm:" + e.name; };
const emptyStats = function () { return { plays: 0, sessions: 0, totalMs: 0, ids: [] }; };

function statsHTML(rows) {
  const totalPlays = rows.reduce(function (a, r) { return a + r.plays; }, 0);
  const t = rows[0];
  let cells = "";
  for (const r of rows) {
    cells += `<tr><td>${r.day}</td><td>${r.plays}</td><td>${r.players}</td><td>${r.avgSec ? r.avgSec + "s" : "-"}</td></tr>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Emoji Catch Stats</title>
<style>
body{font-family:-apple-system,Arial;background:#1b1035;color:#fff;padding:20px}
h1{font-size:20px}
table{border-collapse:collapse;width:100%;max-width:520px}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #3a2b5a}
th{color:#ffe08a}
tr:nth-child(2) td{color:#8effa0;font-weight:bold}
.big{font-size:15px;color:#9fe8ff;margin:10px 0}
.note{opacity:.6;font-size:12px;margin-top:16px}
</style></head><body>
<h1>Emoji Catch - Play Stats</h1>
<div class="big">Today: <b>${t.plays}</b> plays, <b>${t.players}</b> players, avg game <b>${t.avgSec ? t.avgSec + "s" : "-"}</b></div>
<div class="big">Last ${rows.length} days: <b>${totalPlays}</b> total plays</div>
<table><tr><th>Day</th><th>Plays</th><th>Players</th><th>Avg game</th></tr>${cells}</table>
<div class="note">Privacy: only anonymous daily totals are stored - no names, emails, or IPs. Players = unique devices.</div>
</body></html>`;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const path = url.pathname;
    const json = function (obj, status) {
      return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ "Content-Type": "application/json" }, CORS) });
    };

    // ---- anonymous play analytics ----
    if (path === "/event") {
      if (request.method !== "POST") return json({ error: "POST only" }, 405);
      let body; try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
      const key = "stats:" + today();
      let s; try { s = JSON.parse((await env.LEADERBOARD.get(key)) || "null"); } catch (e) { s = null; }
      if (!s) s = emptyStats();
      if (body.type === "start") {
        s.plays++;
        if (body.id) { const h = await hashHex(String(body.id)); if (s.ids.indexOf(h) === -1 && s.ids.length < 5000) s.ids.push(h); }
      } else if (body.type === "end") {
        const ms = Math.floor(Number(body.ms));
        if (Number.isFinite(ms) && ms > 0 && ms < 3600000) { s.sessions++; s.totalMs += ms; }
      }
      await env.LEADERBOARD.put(key, JSON.stringify(s), { expirationTtl: 60 * 60 * 24 * 120 });
      return json({ ok: true });
    }

    // ---- private stats dashboard ----
    if (path === "/stats") {
      if (url.searchParams.get("key") !== (env.STATS_KEY || STATS_KEY)) return new Response("Not authorized", { status: 401, headers: CORS });
      const rows = [];
      for (let i = 0; i < STATS_DAYS; i++) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        let s; try { s = JSON.parse((await env.LEADERBOARD.get("stats:" + d)) || "null"); } catch (e) { s = null; }
        s = s || emptyStats();
        rows.push({ day: d, plays: s.plays, players: (s.ids || []).length, sessions: s.sessions, avgSec: s.sessions ? Math.round(s.totalMs / s.sessions / 1000) : 0 });
      }
      if (url.searchParams.get("format") === "json") return json(rows);
      return new Response(statsHTML(rows), { headers: Object.assign({ "Content-Type": "text/html;charset=UTF-8" }, CORS) });
    }

    // ---- referrals: how many friends has this player invited? ----
    if (path === "/refcount") {
      const id = String(url.searchParams.get("id") || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
      const count = Number((await env.LEADERBOARD.get("refcount:" + id)) || 0);
      return json({ count: count });
    }
    // ---- referrals: credit a referrer when a NEW player joins via their link ----
    if (path === "/refer") {
      if (request.method !== "POST") return json({ error: "POST only" }, 405);
      let body; try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
      const clean = function (v) { return String(v || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40); };
      const referrer = clean(body.referrer), newId = clean(body.newId);
      if (!referrer || !newId || referrer === newId) return json({ ok: false });
      // each new player can only ever be counted once
      const already = await env.LEADERBOARD.get("referredBy:" + newId);
      if (already) return json({ ok: false, already: true });
      // light rate limit per IP
      const rlKey = "rlrefer:" + (await hashHex(request.headers.get("CF-Connecting-IP") || "0"));
      if (Date.now() - Number((await env.LEADERBOARD.get(rlKey)) || 0) < 2000) return json({ ok: false });
      await env.LEADERBOARD.put(rlKey, String(Date.now()), { expirationTtl: 60 });
      await env.LEADERBOARD.put("referredBy:" + newId, referrer);
      const count = Number((await env.LEADERBOARD.get("refcount:" + referrer)) || 0) + 1;
      await env.LEADERBOARD.put("refcount:" + referrer, String(count));
      return json({ ok: true, count: count });
    }

    // ---- leaderboard (default "/") ----
    let board = [];
    try { board = JSON.parse((await env.LEADERBOARD.get("board")) || "[]"); } catch (e) { board = []; }

    if (request.method === "GET") return json(publicView(board));

    if (request.method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") || "0";
      const rlKey = "rl:" + (await hashHex(ip));
      const last = Number((await env.LEADERBOARD.get(rlKey)) || 0);
      if (Date.now() - last < MIN_GAP_MS) return json({ error: "slow down" }, 429);

      let body; try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
      let score = Math.floor(Number(body.score));
      if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return json({ error: "bad score" }, 400);

      const name = cleanName(body.name);
      const id = String(body.id || "").slice(0, 40).replace(/[^a-zA-Z0-9-]/g, "");
      const mine = { id: id, name: name, score: score, ts: Date.now() };

      const at = board.findIndex(function (e) { return keyOf(e) === keyOf(mine); });
      if (at >= 0) { if (score >= board[at].score) board[at] = mine; }
      else board.push(mine);

      board.sort(function (a, b) { return b.score - a.score; });
      board = board.slice(0, KEEP);
      await env.LEADERBOARD.put("board", JSON.stringify(board));
      await env.LEADERBOARD.put(rlKey, String(Date.now()), { expirationTtl: 60 });

      const rank = board.findIndex(function (e) { return keyOf(e) === keyOf(mine); }) + 1;
      return json({ ok: true, rank: rank, top: publicView(board) });
    }

    return json({ error: "method not allowed" }, 405);
  },
};
