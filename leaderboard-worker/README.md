# Emoji Catch — Leaderboard Worker setup

This little Cloudflare Worker stores the high scores. You deploy it once, then
send Claude the URL and it gets wired into the game.

## Deploy it (all in the Cloudflare dashboard — no coding)

1. **Make a place to store the scores (KV):**
   - Go to https://dash.cloudflare.com → left sidebar **Storage & Databases → KV**
     (or use the search box for "KV").
   - Click **Create a namespace**, name it `emoji-catch-leaderboard`, create it.

2. **Create the Worker:**
   - Go to **Workers & Pages → Create → Workers → Create Worker**.
   - Name it `emoji-catch-leaderboard`, click **Deploy** (the default hello-world is fine for now).
   - Click **Edit code**, delete what's there, and paste the entire contents of
     [`worker.js`](./worker.js). Click **Deploy**.

3. **Connect the storage to the Worker:**
   - Open the Worker → **Settings → Bindings** (may be called "Variables and Bindings").
   - **Add binding → KV namespace.**
   - Variable name: **`LEADERBOARD`** (must be exactly this).
   - Namespace: pick `emoji-catch-leaderboard`.
   - Save / Deploy.

4. **Get the URL & test:**
   - The Worker URL looks like
     `https://emoji-catch-leaderboard.<your-subdomain>.workers.dev`
   - Open it in a browser — it should show `[]` (an empty list). That means it works!

5. **Send Claude that URL** and it will build the in-game leaderboard.

## Notes
- Free tier is plenty for a family/friends game.

### Privacy
- The public list only ever exposes a **nickname + score** — no IDs, no timestamps, no IPs.
- The game asks for a **fun generated nickname**, never a real name.
- IPs are only used (hashed) for rate-limiting and are never stored on the board.

### Anti-cheat (kept light on purpose)
- A max score cap rejects absurd values.
- A short per-device rate limit stops spam.
- One entry per player (best score kept), so nobody can flood the board.
- A determined person on their own device could still submit a fake score — that's
  an accepted limitation of a client-only game, fine for family/friends.

### Referral-ready (for later)
- Every player has an anonymous `id` that's sent with scores and stored **privately**
  (never shown publicly). A future referral system can credit invites by `id` and
  add new routes to this same Worker without changing the data model.
