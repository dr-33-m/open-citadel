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
```

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
SAMWELL_CLOUD_URL=https://your-coolify-domain.example eas build -p android --profile preview
```

For remote EAS builds, you can also set `SAMWELL_CLOUD_URL` as a plain EAS
environment variable in the matching `preview` or `production` environment.
Do not store `OPENROUTER_API_KEY` in Expo/EAS app config; it belongs only in the
Coolify server environment.

For local Expo/dev-client runs, start Expo with the same variable:

```bash
SAMWELL_CLOUD_URL=https://your-coolify-domain.example pnpm start
```

## Endpoints

- `GET /health`
- `GET /models`
- `GET /usage` with `x-samwell-device-id`
- `POST /chat/http` with `x-samwell-device-id`

`POST /chat/http` returns TanStack AI's newline-delimited AG-UI event stream for
`xhrHttpStream()`.
