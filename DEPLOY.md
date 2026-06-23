# Deploying to Railway

This app is built to run on [Railway](https://railway.app) with the managed PostgreSQL plugin.
You'll do this once; afterward, deploys are automatic on every `git push`.

## 1. Push the code to GitHub

Railway deploys from a Git repo.

```bash
git init
git add .
git commit -m "ND SP Tracker — hosted multi-user version"
# create an empty repo on GitHub (private), then:
git remote add origin https://github.com/<you>/nd-sp-tracker.git
git branch -M main
git push -u origin main
```

> `.gitignore` already excludes `node_modules/`, `dist/`, `.env`, and uploaded files.
> `seed/initial-data.json` **is** committed — that's the starter dataset.

## 2. Create the Railway project

1. Railway → **New Project** → **Deploy from GitHub repo** → pick the repo.
2. In the project, **+ New** → **Database** → **Add PostgreSQL**.
   Railway automatically exposes `DATABASE_URL` to the app service.
3. Railway reads `railway.json`: it builds with `npm run build` and starts with `npm start`
   (which runs migrations, then boots the server). It also injects `PORT` — the server already
   listens on `process.env.PORT`.

## 3. Set environment variables (app service → Variables)

| Variable         | Value                                                              |
|------------------|--------------------------------------------------------------------|
| `DATABASE_URL`   | *(auto-provided by the Postgres plugin — reference it)*            |
| `SESSION_SECRET` | a long random string (e.g. `openssl rand -hex 32`)                 |
| `APP_PASSWORD`   | the shared team password people type to sign in                   |
| `NODE_ENV`       | `production`  (enables secure session cookies)                    |
| `UPLOAD_DIR`     | `/data/uploads`  (see volume below; optional for v1)              |

To reference the database URL, set `DATABASE_URL` to `${{Postgres.DATABASE_URL}}` in the app
service variables (Railway's reference syntax), or just add the Postgres plugin to the same
service which provides it automatically.

## 4. Seeding (automatic)

Nothing to do. On startup the app runs migrations, then **seeds the database only if it's empty**
(`node dist/src/seed-if-empty.js`). So the very first deploy auto-loads `seed/initial-data.json`
(9 properties, 94 projects, the GL, cash snapshots), and every later deploy detects existing data
and skips seeding — your live data is never wiped by a deploy.

If you ever want to re-seed deliberately, use **Upload & Data → Reset to starter data** in the UI,
or **Import backup** to load a JSON backup.

## 5. (Optional) Persistent volume for bid PDFs

Bid-document uploads are written to `UPLOAD_DIR`. To keep them across deploys, add a Railway
**Volume** mounted at `/data` and set `UPLOAD_DIR=/data/uploads`. Without a volume, uploaded
files live on the ephemeral container filesystem and are lost on redeploy (project/cash/GL data
is always safe — that's in Postgres). For v1 with no bid files in the seed, this is optional.

## 6. Done

Open the generated URL, enter `APP_PASSWORD`, and you're in. Share the URL + password with Holly
and Brittanee. Everyone edits the same live data; per-record writes mean simultaneous edits to
different projects don't collide.

---

# Later: switch from shared password to Microsoft 365 / Entra SSO

The shared password is intentionally a thin, swappable gate. The whole auth surface is in
`src/auth.ts` plus three routes wired in `src/server.ts` (`/api/login`, `/api/logout`,
`/api/auth/status`) and the `requireAuth` middleware on `/api`. To move to Entra SSO:

1. **Register an app** in Entra (Azure AD): Azure Portal → Entra ID → App registrations → New.
   - Redirect URI (Web): `https://<your-railway-domain>/auth/callback`
   - Note the **Application (client) ID**, **Directory (tenant) ID**, and create a **client secret**.
2. **Add a library:** `npm i openid-client` (or `passport-azure-ad`).
3. **Replace the login flow** in `src/auth.ts`:
   - `/api/login` → redirect to Entra's authorize endpoint.
   - add `/auth/callback` → exchange the code, verify the token, set `req.session.authed = true`
     and store the user's email/name in the session.
   - keep `requireAuth` exactly as-is — it just checks `req.session.authed`.
4. **Add env vars:** `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`,
   `ENTRA_REDIRECT_URI`. Remove `APP_PASSWORD`.
5. Restrict to your tenant so only Monarch accounts can sign in.

Because every `/api/*` route is already behind `requireAuth` and sessions are stored in Postgres,
nothing else has to change. If you later want per-user roles (e.g. Holly → Minot, Brittanee →
Williston), the natural place is to record the signed-in user on the session and filter writes
by region — but that's a future decision, not required for v1.
