# Dhan Sarthi — backend

One Fastify server, one Postgres database. Deliberately not microservices: a rival's repo has
six service directories and every one of them still contains only a `.gitkeep`.

## Run it

```bash
# Postgres with pgvector
docker run -d --name dhan-sarthi-pg \
  -e POSTGRES_PASSWORD=dhansarthi -e POSTGRES_USER=dhansarthi -e POSTGRES_DB=dhansarthi \
  -p 5433:5432 pgvector/pgvector:pg16

cd server
cp .env.example .env      # fill in OPENAI_API_KEY
npm install
npm run migrate
npm start                 # :3001
```

The Vite dev server proxies `/api` to `:3001`, so the whole app is on `localhost:5173`.

## What's here

```
src/
  index.js            Fastify app, health check, route registration
  db.js               pool, migrations, pgvector helper
  memory.js           extraction, safeguards, embedding, ranking
  providers/
    llm.js            chat() + embed() + realtimeToken() — the only file that knows the provider
    bank.js           adapter: fixtures now, IDBI's APIs later
  routes/
    session.js        POST /api/realtime-token
    memory.js         remember / recall / list / forget
    snapshot.js       GET /api/snapshot/:cif
  fixtures/rohan.js   demo customer, in the shape IDBI's APIs return
migrations/001_init.sql
```

## The two adapters

Everything external sits behind one of these, and nothing above them knows which
implementation is live.

**`providers/llm.js`** — moving to Bedrock is a change to this file and nothing else.
One caveat: `text-embedding-3-small` is 1536 dimensions, Titan V2 is 1024. Switching embedding
provider means a schema change and a re-embed of every stored memory. Decide once, early.

**`providers/bank.js`** — `BANK_SOURCE=fixtures` today, `idbi` when sandbox credentials land.
IDBI's catalogue maps onto the interface: API 456 → `getCustomer`, 394 → `getAccounts`,
393 → `getTransactions`, 402/442 → `getLiabilities`.

**Gap worth knowing:** the catalogue has no API for mutual fund holdings, insurance policies,
the product shelf, or placing an order. `getHoldings` and `getProductShelf` stay on fixtures
until the Bank confirms otherwise. Raised with them by email.

## Schema

Four tables. `customers` and `consents` for who they are and what they permitted; `memories`
for continuity; `advice_records` for every recommendation, its basis, and whether the
suitability gate let it through — retained five years per SEBI's AI/ML framework.

Memories cascade off the customer, so revoking consent actually deletes something. Revocation
that leaves the data in place is theatre.

## One snapshot, one source of truth

`GET /api/snapshot/:cif` returns the whole customer in one object, and every surface reads from
it — screens and the conversational layer alike. Which means the advisor physically cannot
quote a number the UI doesn't show.

Borrowed from Team X's architecture. It's the best idea in their codebase.

## Health

```bash
curl localhost:3001/api/health
# { ok, database, llm, bankSource, embeddingDimensions }
```

Says whether the database is reachable, whether a model key is configured, and which bank
source is live. Check this first when something behaves oddly.
