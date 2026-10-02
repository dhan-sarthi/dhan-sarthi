/**
 * RM passwords: scrypt, salted, and compared in constant time.
 *
 * The demo passwords are printed on the sign-in page, so what this protects is not their
 * secrecy but the shape of the thing: a desk user table that held passwords, or fast hashes of
 * them, would be the first finding of any review, and swapping in real staff credentials later
 * must not mean changing how they are stored. Node's own scrypt, so nothing is added to the
 * dependency tree for it.
 *
 * The stored form names its own parameters (`scrypt$N$r$p$salt$hash`), so raising the cost later
 * leaves every existing hash verifiable.
 */
import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto'

/** OWASP's floor for scrypt: 2^14, block size 8, no parallelism. About 40 ms on a laptop. */
const N = 16_384
const R = 8
const P = 1
const KEY_BYTES = 32
const SALT_BYTES = 16

function encode(n: number, r: number, p: number, salt: Buffer, hash: Buffer): string {
  return `scrypt$${n}$${r}$${p}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

/**
 * Synchronous on purpose: it runs where the desk is seeded, at boot or in the seed CLI, and
 * never inside a request.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES)
  const hash = scryptSync(password, salt, KEY_BYTES, { N, r: R, p: P })
  return encode(N, R, P, salt, hash)
}

interface Parsed {
  n: number
  r: number
  p: number
  salt: Buffer
  hash: Buffer
}

function parse(stored: string): Parsed | null {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  if (![n, r, p].every((x) => Number.isInteger(x) && x > 0)) return null
  const salt = Buffer.from(parts[4] ?? '', 'base64url')
  const hash = Buffer.from(parts[5] ?? '', 'base64url')
  if (salt.length === 0 || hash.length === 0) return null
  return { n, r, p, salt, hash }
}

function derive(password: string, parsed: Parsed): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem above the default 32 MiB, so a hash written with a raised N still verifies.
    const maxmem = Math.max(64 * 1024 * 1024, 256 * parsed.n * parsed.r)
    scrypt(
      password,
      parsed.salt,
      parsed.hash.length,
      { N: parsed.n, r: parsed.r, p: parsed.p, maxmem },
      (err, key) => (err ? reject(err) : resolve(key)),
    )
  })
}

/** Whether `password` is the one `stored` was made from. A malformed hash matches nothing. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored)
  if (parsed === null) return false
  const key = await derive(password, parsed)
  return key.length === parsed.hash.length && timingSafeEqual(key, parsed.hash)
}

let decoy: string | null = null

/**
 * A hash nobody's password matches, verified against when the employee number is unknown, so a
 * wrong number and a wrong password cost the same time and an attacker cannot list the desk by
 * watching the clock.
 *
 * Made once per process, and not at import, because the seed CLI imports this file and never
 * signs anyone in. `RmAuthService` asks for it in its constructor, so it exists before the first
 * request: made lazily on the first unknown number, that request paid for this synchronous
 * scrypt as well as the verify, took twice as long as a wrong password, and said which it was.
 */
export function decoyHash(): string {
  decoy ??= hashPassword(randomBytes(24).toString('base64url'))
  return decoy
}
