# Public URL on Fly.io

The fastest public deployment that satisfies the one hard constraint: the API is a persistent
process, because the Runway RPC host holds a LiveKit connection for the life of every call. Two
Fly apps in Mumbai (`bom`), built from the repository's own Dockerfiles, talking over Fly's
private network. The IDBI-account deployment is Terraform under `infra/terraform`; this is the
review link that exists regardless of that timeline.

## One-time setup

```bash
fly auth login                                     # a browser window; once per machine

fly apps create dhan-sarthi-api
fly apps create dhan-sarthi-web

# The API's secrets. DATABASE_URL is the Supabase session-pooler string from apps/api/.env.
fly secrets set -a dhan-sarthi-api \
  DATABASE_URL='postgresql://…' \
  RUNWAY_API_KEY='key_…' \
  RUNWAY_CHARACTER_ID='…' \
  OPERATOR_KEY="$(openssl rand -hex 24)"
```

## Deploy

From the repository root, API first, then web:

```bash
fly deploy -c fly.api.toml
fly deploy -c fly.web.toml
```

The web app reaches the API at `http://dhan-sarthi-api.internal:3001` on Fly's private IPv6
network, so the API needs no public IPv4 of its own. The review link is the web app's hostname
(`fly status -a dhan-sarthi-web` prints it, or `fly open -c fly.web.toml`).

## After a deploy

```bash
curl -s https://dhan-sarthi-web.fly.dev/api/v1/health | jq
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
- One machine each. A rolling deploy briefly overlaps two API machines; the Postgres lease
  claim is atomic, so both can serve safely for those seconds.
- Costs: two shared-CPU machines are within Fly's free allowance or a few dollars a month; the
  Runway budget is the only meaningful spend and it is capped by the daily minute budget.
