/**
 * Reading the captured calls off disk, so the replay transport can answer with IDBI's own
 * bytes rather than with wire we generated.
 *
 * The pairing convention is the capture script's: `<code>-<op>[-sN].json` is a response and
 * `<code>-<op>[-sN].request.json` is the body that produced it. A response with no request
 * beside it is skipped rather than guessed at, because a fixture nothing can be matched
 * against is worse than a missing one — it would answer every request for its operation.
 *
 * The three bodies the sandbox refused are loaded too, with their real 400. They are how the
 * offline path exercises the refusal handling, which is otherwise only reachable by asking a
 * live bank a question it does not like.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CapturedCall } from './replay.ts'
import { operationByPath } from './operations.ts'

/** Which captures answered with a 400. Everything else in the set answered 200. */
const REFUSED_WITH_400 = new Set([
  '362-accountLienEnquirytest-s2.json',
  '391-getLoanAccountDetailstest-s2.json',
  '428-createLeadtest-s3.json',
])

export const CAPTURED_DIR = join(dirname(fileURLToPath(import.meta.url)), '../captured')

/**
 * Every captured call, or an empty list where the directory is not on disk.
 *
 * Empty rather than a throw, because `tsc -b` emits JavaScript and does not copy JSON: a built
 * `dist` has no `captured/`, and a deployment there is expected to be talking to the real
 * sandbox anyway. The replay transport answers 501 per operation in that case, which says
 * "no fixture" loudly instead of serving a plausible empty body.
 */
export function loadCapturedCalls(dir: string = CAPTURED_DIR): CapturedCall[] {
  if (!existsSync(dir)) return []
  const out: CapturedCall[] = []
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.json') || file.endsWith('.request.json')) continue
    const m = /^\d{3}-(.+?)(?:-s\d+)?\.json$/.exec(file)
    if (m === null) continue
    const op = m[1] as string
    if (operationByPath(op) === null) continue
    const requestFile = join(dir, file.replace(/\.json$/, '.request.json'))
    if (!existsSync(requestFile)) continue
    out.push({
      op,
      request: JSON.parse(readFileSync(requestFile, 'utf8')),
      response: JSON.parse(readFileSync(join(dir, file), 'utf8')),
      status: REFUSED_WITH_400.has(file) ? 400 : 200,
    })
  }
  return out
}
