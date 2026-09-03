/**
 * The one way this process opens a Postgres connection.
 *
 * Two things are decided here for every query in the API. Numbers come back as numbers and
 * dates come back as 'YYYY-MM-DD' strings, because core's types are numbers and strings and a
 * `Date` crossing a timezone is how the 1st becomes the 31st. And every connection can take on
 * the runtime role (`dhan_app`), which is what makes the REVOKEs in migration 0007 bind the API
 * without a second login: the seed and the migrator connect as the owner, the server as the
 * role that cannot UPDATE a record.
 */
import pg from 'pg'

/** What an adapter queries through. Both `pg.Pool` and a checked-out `pg.PoolClient` satisfy it. */
export interface Db {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>>
}

export interface PoolOptions {
  connectionString: string
  /** The Supabase session pooler counts every connection; five is plenty for one API task. */
  max?: number
  /** Per-statement ceiling. A runaway query is a 500, not a stuck pool. */
  statementTimeoutMs?: number
  /** `SET ROLE` on every connection. The API passes 'dhan_app'; migrate and seed pass nothing. */
  role?: string
  applicationName?: string
  /** Errors on idle connections (a pooler dropping a session) land here instead of crashing. */
  onError?: (err: Error) => void
}

const OID = { int8: 20, numeric: 1700, date: 1082 } as const

const parsers = new Map<number, (value: string) => unknown>([
  [OID.numeric, Number],
  [OID.int8, Number],
  [OID.date, (s) => s],
])

// A custom parser table rather than `pg.types.setTypeParser`, so nothing leaks into another
// pool that happens to share the process.
const types: pg.CustomTypesConfig = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') => {
    const parser = format === 'binary' ? undefined : parsers.get(oid)
    return parser ?? pg.types.getTypeParser(oid, format as 'text')
  }) as pg.CustomTypesConfig['getTypeParser'],
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/

type ConnectCallback = ((err: Error) => void) | ((err: null, client: pg.Client) => void)

/**
 * A client whose connection is not "up" until the session is configured. Doing this inside
 * `connect()` rather than on the pool's `connect` event means the pool never hands out a
 * connection that is still applying its timeout and role, and a failed `SET ROLE` is a failed
 * connection rather than an unscoped one.
 */
function clientWithSetup(setup: string): new () => pg.ClientBase {
  class SetupClient extends pg.Client {
    override connect(): Promise<this>
    override connect(callback: ConnectCallback): void
    override connect(callback?: ConnectCallback): Promise<this> | void {
      const run = (done: (err: Error | null) => void): void => {
        super.connect((err: Error | null) => {
          if (err) {
            done(err)
            return
          }
          this.query(setup).then(
            () => done(null),
            (setupErr: Error) => done(setupErr),
          )
        })
      }
      if (callback) {
        const cb = callback as (err: Error | null, client?: pg.Client) => void
        run((err) => (err ? cb(err) : cb(null, this as pg.Client)))
        return
      }
      return new Promise<this>((resolve, reject) => {
        run((err) => (err ? reject(err) : resolve(this)))
      })
    }
  }
  return SetupClient as unknown as new () => pg.ClientBase
}

export function createPool(opts: PoolOptions): pg.Pool {
  if (opts.role !== undefined && !IDENTIFIER.test(opts.role)) {
    throw new Error(`refusing to SET ROLE to "${opts.role}": not a plain identifier`)
  }

  const setup = [`SET statement_timeout = ${Math.max(1_000, opts.statementTimeoutMs ?? 15_000)}`]
  if (opts.role) setup.push(`SET ROLE ${opts.role}`)

  const pool = new pg.Pool({
    connectionString: opts.connectionString,
    max: opts.max ?? 5,
    types,
    application_name: opts.applicationName ?? 'dhan-sarthi-api',
    // Supavisor closes idle sessions; recycling before it does avoids a dead first query.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    Client: clientWithSetup(setup.join('; ')),
  })

  pool.on('error', opts.onError ?? (() => {}))
  return pool
}

/** Postgres error code, when the thrown value is one. */
export function pgCode(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code
    return typeof code === 'string' ? code : null
  }
  return null
}

/** SQLSTATE classes the adapters switch on. */
export const PG = {
  uniqueViolation: '23505',
  checkViolation: '23514',
  integrityViolation: '23000',
  insufficientPrivilege: '42501',
} as const

/**
 * Run independent queries together on a pool, one after another on a checked-out client.
 *
 * A pool spreads them across connections; a single client can only execute one statement at a
 * time and pg warns when asked for more, so a store bound into a transaction takes the
 * sequential path without the caller knowing which it has.
 */
export function parallel<T extends readonly unknown[]>(
  db: Db,
  tasks: readonly [...{ [K in keyof T]: () => Promise<T[K]> }],
): Promise<T> {
  if ('totalCount' in db) {
    return Promise.all(tasks.map((task) => task())) as unknown as Promise<T>
  }
  return tasks.reduce<Promise<unknown[]>>(
    (chain, task) => chain.then(async (acc) => [...acc, await task()]),
    Promise.resolve([]),
  ) as unknown as Promise<T>
}
