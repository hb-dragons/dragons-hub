# @dragons/api

Hono API service for the Dragons workspace.

## Development

```bash
pnpm install
pnpm --filter @dragons/api dev
```

The API runs on `http://localhost:3001` by default.

## Scoreboard ingest

A Raspberry Pi running `apps/pi/Panel2Net.py` POSTs raw Stramatel frames to
`POST /api/scoreboard/ingest` over HTTPS, authenticated with a bearer key.

Required env vars (declared in `src/config/env.ts`):

- `SCOREBOARD_INGEST_KEY` — long random secret. Generate with
  `openssl rand -base64 48`.
- `SCOREBOARD_DEVICE_ID` — must match the `Device_ID` HTTP header sent by
  the Pi. Single-device guard for now.

The same key value is installed on the Pi at
`/home/pi/Panel2Net/scoreboard.key` (mode `0600`).

### Key rotation

1. Regenerate `SCOREBOARD_INGEST_KEY` and redeploy the API.
2. On the Pi, replace `/home/pi/Panel2Net/scoreboard.key` and run
   `sudo systemctl restart panel2net.service`.

## Commands

- `pnpm --filter @dragons/api lint`
- `pnpm --filter @dragons/api typecheck`
- `pnpm --filter @dragons/api test`
- `pnpm --filter @dragons/api coverage`
- `pnpm --filter @dragons/api build`
