# Samwell Cloud Server

Hono + TanStack AI endpoint for Samwell Cloud. The mobile app streams to this
server; this server owns the OpenRouter API key, model allow-list, and rolling
message limits.

## Environment

Copy `.env.example` to `.env`:

```bash
cp server/.env.example server/.env
```

Set at least:

```env
OPENROUTER_API_KEY=sk-or-...
PORT=8787
DATABASE_URL=file:./samwell-cloud.sqlite
LOGTO_ENDPOINT=https://your-tenant.logto.app
```

`LOGTO_ENDPOINT` is what every metered route verifies its caller against.
Samwell Cloud runs on accounts: there is no anonymous path, and a request
without a valid Logto access token for the Samwell API resource is a 401.

## Run

```bash
pnpm --filter samwell-cloud-server start
```

## Docker / Coolify

This repo includes a root `Dockerfile` for deploying the server from the repo
root while still including `packages/samwell-shared`.

Coolify settings:

```txt
Build Pack: Dockerfile
Dockerfile Location: /Dockerfile
Port: 8787
Health Check Path: /health
```

Environment:

```env
OPENROUTER_API_KEY=sk-or-...
PORT=8787
DATABASE_URL=file:/data/samwell-cloud.sqlite
SAMWELL_ALLOWED_ORIGIN=*
LOGTO_ENDPOINT=https://your-tenant.logto.app
OPENROUTER_HTTP_REFERER=https://your-domain.com
OPENROUTER_APP_TITLE=Open Citadel
```

Attach persistent storage:

```txt
Mount path: /data
```

The Docker image defaults `DATABASE_URL` to
`file:/data/samwell-cloud.sqlite`, so the `/data` mount keeps usage counters
across deploys. You can override it in Coolify if you move the database.

The mobile app endpoint is managed internally by the app build. Users should
not be able to edit the Samwell Cloud URL in Settings.

For a test Android build after Coolify deploys, bake the HTTPS backend URL into
the app config:

```bash
SAMWELL_CLOUD_URL=https://your-coolify-domain.example \
LOGTO_ENDPOINT=https://your-tenant.logto.app \
LOGTO_APP_ID=your-native-app-id \
  eas build -p android --profile preview
```

`LOGTO_ENDPOINT` and `LOGTO_APP_ID` are the app's half of the account. Neither
is a secret — a native app is a public OIDC client — and a build made without
them simply has no account: the Profile shows no account card and Grand Maester
Samwell says he cannot be reached.

For remote EAS builds, you can also set `SAMWELL_CLOUD_URL` as a plain EAS
environment variable in the matching `preview` or `production` environment.
Do not store `OPENROUTER_API_KEY` in Expo/EAS app config; it belongs only in the
Coolify server environment.

For local Expo/dev-client runs, start Expo with the same variable:

```bash
SAMWELL_CLOUD_URL=https://your-coolify-domain.example \
LOGTO_ENDPOINT=https://your-tenant.logto.app \
LOGTO_APP_ID=your-native-app-id \
  pnpm start
```

## Logto

One Native application, plus one API resource with the identifier
`https://api.open-citadel.online` (the value of `SAMWELL_API_RESOURCE` in
`packages/samwell-shared`). The resource is what makes Logto issue a JWT this
server can verify by itself; without one the access token is opaque and only
Logto can read it. It is an identifier, not an address — nothing fetches it,
and it never has to resolve.

The resource needs **no permissions**. This server authorises on identity, not
on scope: it checks the signature, the issuer, the audience and the expiry, and
nothing reads the `scope` claim. A permission would only matter once something
here refuses a token for lacking it, and a permission that is defined but not
granted through a role does not appear in the token anyway — so adding one now
buys nothing and can only lock people out later. The credit redesign is the
point to add one, alongside whatever checks it.

Register a redirect URI per build variant, since each has its own scheme:

```txt
opencitadel://callback
opencitadel-dev://callback
opencitadel-preview://callback
```

Sign-in experience is console configuration and nothing in the app decides it:
identifier `Email address`, with `Password` and `Verification code` enabled.

## Endpoints

Every route below that spends money or counts against an allowance takes
`Authorization: Bearer <logto access token>`, and answers 401 without one.
`/health` and `/models` are open.

- `GET /health`
- `GET /models`
- `GET /usage`
- `POST /chat/http`
- `POST /chat/title`
- `POST /tags/suggest`
- `POST /compass/takeaway`

`POST /chat/http` returns TanStack AI's newline-delimited AG-UI event stream for
`xhrHttpStream()`.

Admin routes, all guarded by `x-admin-key` against `ADMIN_API_KEY`. Model
changes take effect immediately, need no deploy, and survive restarts: the
catalog lives in the database, code only seeds a fresh one. Labels, providers,
context windows, and capabilities are pulled from OpenRouter's model metadata,
so the admin sends only an identifier.

- `POST /admin/models` with `{"id": "z-ai/glm-5.3-flash", "makeDefault": true}`
- `PATCH /admin/models/:id` re-pulls a stored model's metadata
- `DELETE /admin/models/:id` retires a model (the default auto-promotes)
- `PUT /admin/models/default` with `{"id": "..."}` switches the default

A model ID OpenRouter does not know is rejected, so a typo can never enter
the request fallback chain.
