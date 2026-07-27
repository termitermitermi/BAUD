# BAUD is an example deployment of DYSCHAN....

## DYSCHAN
Stateless serverless anonymous message board.

### Description
DYSCHAN is a privacy-first chan-style message board built for edge runtimes. There are no user accounts and no database server. Boards, threads, and posts are stored as JSON objects in S3-compatible storage (for example Cloudflare R2).

The product is designed so you can pair:
- a **static frontend** (GitHub Pages / Cloudflare Pages / Netlify / etc.)
- with a **portable edge API** (Cloudflare Workers, Vercel Edge, and other Fetch-compatible runtimes)

### Use Cases
- Private community boards shared by phrase/board ID.
- Anonymous discussion spaces without account management.
- Lightweight self-hosted or edge-hosted forums.
- Moderated boards where teams need controls without heavyweight backend infrastructure.

### Features & Highlights
- Anonymous posting with no account system.
- Stateless API handlers (`Request -> Response`) using web-standard APIs.
- S3-compatible object storage support (R2, S3, MinIO, etc.).
- Browser-side proof-of-work (PoW) to reduce spam.
- Optional deterministic visual identity via client-side secret (`style_seed`).
- Static moderation dashboard (`client/admin.html`) with role-based admin tokens.
- Runtime portability: same core logic across edge/worker environments.

### Architecture

```
client/        Static HTML/CSS/TS frontend + admin dashboard
api/           Fetch-style edge entrypoints
src/handlers/  Business logic (join/thread/post/board/get-thread/moderation)
src/lib/       Shared utilities (storage, schema, crypto, auth)
rust/          Crypto WASM source used by client-side helpers
```

Flow:
1. User opens static client.
2. Client calls edge API endpoints.
3. API reads/writes JSON objects in S3-compatible storage.
4. Client renders board/thread/post data from API responses.

## Quick Start (GitHub Pages + Cloudflare Workers/R2 Example)

This deployment path requires no Node.js runtime in production.

#### 1) Create Cloudflare R2 storage
1. Create an R2 bucket (for example `dyschan`).
2. Create an R2 API token with read/write/list access.
3. Note your endpoint and credentials.

Required environment variables for API runtime:
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`
- `STORAGE_ENDPOINT`
- `STORAGE_BUCKET`
- `ALLOWED_ORIGINS` (comma-separated exact origins allowed by CORS, for example `https://example.com,http://localhost:5173`; wildcard `*` is ignored)

#### 2) Deploy API to Cloudflare Workers
Use a **single Worker entrypoint** (`api/worker.ts`) that routes all API paths.

The API package is self-contained for Worker deployments:
- no files need to be copied from `client/wasm`
- no manual WASM URL patching is required
- no Wrangler alias override for `@aws-sdk/client-s3` is required

1. Create a Worker and edit `wrangler.jsonc` (included in this repository as the recommended default format).
2. Keep `main = "api/worker.ts"` (Workers require one entrypoint script).
3. Set `STORAGE_*` secrets:
   - `wrangler secret put STORAGE_ACCESS_KEY`
   - `wrangler secret put STORAGE_SECRET_KEY`
4. Set non-secret values in `wrangler.jsonc`:
   - `STORAGE_BUCKET`
   - `STORAGE_ENDPOINT`
   - `ALLOWED_ORIGINS` (comma-separated exact origins, for example `https://example.com,http://localhost:5173`; `*` is ignored)
   - optional: `STORAGE_REGION` (`STORAGE_PROVIDER` defaults to `auto` and will use `s3-compatible` in Workers)
5. Deploy with:

```bash
npx wrangler deploy
```

6. Confirm your Worker URL (example: `https://your-api.example.workers.dev`) serves both:
   - canonical routes like `/join`, `/thread/:thread_id`
   - legacy routes like `/api/join`, `/api/get-thread`

`wrangler.toml` is also supported by Wrangler if you prefer TOML.

#### 3) Deploy client to GitHub Pages
1. Build static client assets so `client/dist/*.js` exists:

```bash
npm ci
npm run build:client
```

2. Publish `/client` (including generated `client/dist/`) as the site root.
3. Set API base in client HTML pages (`client/index.html`, `client/board.html`, `client/thread.html`):

```html
<meta name="dyschan-api-base-url" content="https://your-api.example.workers.dev/api">
```

4. Choose and document your shared board phrases:
   - pick at least one phrase for your community board(s)
   - define a separate private **admin phrase** for your moderation-only board
   - anyone with a phrase can derive/join its board ID, so keep the admin phrase private

5. *(Optional)* Configure default boards in `client/index.html` if you want prefilled links on the homepage:

```html
<meta name="dyschan-default-boards" content='[
  {"id":"<board-id-hex>", "phrase":"community phrase"},
  {"id":"<board-id-hex>", "name":"board label"}
]'>
```

If you omit `dyschan-default-boards`, the index page will hide the **Default Boards** section.

6. Open your Pages URL and create/join a board.

### GitHub Actions

- `CI` runs on pull requests and pushes to `main`, then executes `npm ci`, `npm test`, `npm run typecheck`, and `npm run build:client`.
- `CI` also enforces repository footprint guardrails (10 MB tracked-file limit and disallowed tracked build artifacts such as `client/dist/`, `api/.wrangler/`, `rust/target/`, `*.map`, `*.log`, and non-canonical `*.wasm` files).
- `Deploy client to GitHub Pages` runs on pushes to `main` (and manually), rebuilds the client assets, and publishes `/client` to `termitermitermi/BAUD` on branch `gh-pages`.
- `Copilot Setup Steps` preinstalls the Rust WASM target and a prebuilt `wasm-bindgen` CLI binary so Copilot agent sessions can build the client without compiling the CLI from source first.
- Before using the Pages workflow, add a `BAUD_DEPLOY_TOKEN` repository secret in `termitermitermi/DYSCHAN` (PAT with write access to `termitermitermi/BAUD`) and configure Pages in `termitermitermi/BAUD` to serve from `gh-pages`.
- Make sure the client HTML files point `dyschan-api-base-url` at your deployed API.

### API Surface (Portable Routes)
- `POST /join`
- `POST /thread`
- `POST /post`
- `GET /board/:board_id`
- `GET /thread/:thread_id?board_id=...`
- `POST /flag`
- `POST /admin`

Legacy `/api/*` paths remain available via rewrites.

## Moderation Snapshot
- Role-based admin tokens (`ADMIN_TOKEN`, `ADMIN_TOKEN_MOD`, `ADMIN_TOKEN_VIEWER`).
- Actions include flag resolution, freeze/unfreeze, lock/unlock, delete, shadowban, and anti-abuse controls.
- Moderation records are stored under a dedicated `moderation/` storage prefix.

## Proof Of Work
🔧 Core Summary of the PoW System
🧱 Payload construction
The client builds a single concatenated string:
timestamp, threadId, boardId, bodyHash (SHA‑256 of post body), salt (random per‑user), nonce (incremented during mining)
This binds the work to the exact post content and location.

⛏️ Mining the nonce
The client repeatedly:
Rebuilds the payload, Hashes it with SHA‑256 (WASM for speed), Counts leading zero bits, Stops when leadingZeroBits ≥ difficulty (default 16 bits ≈ 1/65k tries)
It yields every 1000 iterations to stay responsive.

🛡️ Server validation
The server re‑computes everything and checks:
Timestamp within ±60s, Hash meets difficulty, Difficulty escalation (per‑user) is respected, Shadowbanned users always “succeed” even with invalid PoW

🧬 Identity via salt
The salt also defines a stable pseudonymous identity:
user_hash = sha256("user:" + salt)
This enables rate limits, moderation, and shadowbans without accounts.

## Why This Project
DYSCHAN is built to stay small, portable, and deployable across providers while keeping anonymous discussion as a first-class product experience.
