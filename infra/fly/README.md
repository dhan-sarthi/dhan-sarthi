# Public URL on Fly.io

The fastest public deployment that satisfies the one hard constraint: the API is a persistent
process, because the Runway RPC host holds a LiveKit connection for the life of every call. One
Fly app in Mumbai (`bom`), built from the repository's own Dockerfile. The IDBI-account
deployment is Terraform under `infra/terraform`; this is the review link that exists regardless
of that timeline.

There was a second Fly app here, `dhan-sarthi-web`, serving `apps/web`'s static build behind an
nginx image and proxying `/api` to this one over Fly's private network. `apps/web` was deleted on
20 September 2026 ([ADR-0001](../../docs/architecture/adr/ADR-0001.md)) and `fly.web.toml` went
with it, so this API is the whole deployment. The client is `apps/mobile`, which is published to
S3 and CloudFront by `infra/scripts/deploy-web.sh`, not to Fly.

## One-time setup

```bash
fly auth login                                     # a browser window; once per machine

fly apps create dhan-sarthi-api

# The API's secrets. DATABASE_URL is the Supabase session-pooler string from apps/api/.env.
fly secrets set -a dhan-sarthi-api \
  DATABASE_URL='postgresql://…' \
  RUNWAY_API_KEY='key_…' \
  RUNWAY_CHARACTER_ID='…' \
  OPERATOR_KEY="$(openssl rand -hex 24)"
```

## Deploy

From the repository root:

```bash
fly deploy -c fly.api.toml
```

`fly.api.toml` is the only target in the repository. The review link is the API's own hostname
(`fly status -a dhan-sarthi-api` prints it, or `fly open -c fly.api.toml`) — `[http_service]` in
`fly.api.toml` already gives it a public `https` address, which is what the mobile client points
`EXPO_PUBLIC_API_URL` at. Nothing reaches it over Fly's private network any more.

## After a deploy

```bash
curl -s https://dhan-sarthi-api.fly.dev/api/v1/health | jq
fly logs -a dhan-sarthi-api
```

`/api/v1/health` reports the bank source, the seed hash and the avatar provider state. A
`breaker` other than `closed` or `rpcOpen` stuck above zero after calls have ended is the first
thing to look at.

## Operating notes

- The database is shared with development. Reseeding with `--force` erases every reviewer
  session, including those on the public link; do it outside review hours.
- `RUNWAY_MAX_SESSION_SECONDS` and `RUNWAY_DAILY_MINUTE_BUDGET` are plain environment in
  `fly.api.toml`; change them there and redeploy, or `fly secrets set` to override without a
  build.
- `AVATAR_ENABLED=false` is the kill switch: the API keeps serving every screen and the text
  tier while calls are refused with an honest message.
- One machine. A rolling deploy briefly overlaps two API machines; the Postgres lease claim is
  atomic, so both can serve safely for those seconds.
- Costs: one shared-CPU machine is within Fly's free allowance or a few dollars a month; the
  Runway budget is the only meaningful spend and it is capped by the daily minute budget.
