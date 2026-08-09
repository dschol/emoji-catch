// =====================================================================
//  Emoji Catch — Leaderboard Worker (Cloudflare)
//  Bind a KV namespace to this Worker with the variable name: LEADERBOARD
//
//  Routes:
//    GET  /   -> top 20 scores, PUBLIC view only: [{ name, score }]
//    POST /   -> body { name, score, id }; adds/updates a score
//
//  Design notes:
//   - Privacy: the public list only ever exposes a nickname + score. No IDs,
//     no timestamps, no IPs. The game asks for a fun nickname (never a real
//     name). IPs are only used, hashed, for basic rate-limiting and are never
//     stored on the board.
//   - Anti-cheat (kept light, for family/friends): a max score cap, a short
//     per-device rate limit, and one entry per player (best score kept).
//   - Referral-ready: every player has an anonymous "id". We store it privately
//     with each entry so a future referral system can credit invites by id
//     without changing this data model or leaking anything publicly.
// =====================================================================

const MAX_SCORE = 100000;   // reject absurd/cheated scores above this
const KEEP = 200;           // how many top scores to store
const TOP = 20;             // how many to show
const MIN_GAP_MS = 3000;    // basic anti-spam: min time between submits per device
const BAD = ["badword", "swear1", "swear2"];   // backstop filter (nicknames are generated client-side)

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

// Hash the IP so we never store a raw IP (privacy) — used only for rate-limiting.
async function hashIP(ip) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ec-salt:" + ip));
  return [...new Uint8Array(buf)].slice(0, 8).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

const publicView = function (b) { return b.slice(0, TOP).map(function (e) { return { name: e.name, score: e.score }; }); };
const keyOf = function (e) { return e.id ? "id:" + e.id : "nm:" + e.name; };

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const json = function (obj, status) {
      return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ "Content-Type": "application/json" }, CORS) });
    };

    let board = [];
    try { board = JSON.parse((await env.LEADERBOARD.get("board")) || "[]"); } catch (e) { board = []; }

    if (request.method === "GET") return json(publicView(board));

    if (request.method === "POST") {
      // basic anti-spam rate limit (per hashed IP)
      const ip = request.headers.get("CF-Connecting-IP") || "0";
      const rlKey = "rl:" + (await hashIP(ip));
      const last = Number((await env.LEADERBOARD.get(rlKey)) || 0);
      if (Date.now() - last < MIN_GAP_MS) return json({ error: "slow down" }, 429);

      let body;
      try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }

      let score = Math.floor(Number(body.score));
      if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return json({ error: "bad score" }, 400);

      const name = cleanName(body.name);
      const id = String(body.id || "").slice(0, 40).replace(/[^a-zA-Z0-9-]/g, "");
      const mine = { id: id, name: name, score: score, ts: Date.now() };

      // one entry per player (keyed by anonymous id) — keep their best score
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
