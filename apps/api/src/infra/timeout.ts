/**
 * A deadline on any promise, with an AbortSignal for the calls that can honour one.
 *
 * Every outbound call in the API runs under one of these. A hung provider must become a typed
 * failure inside the tier budget, never a request that waits out the load balancer.
 */
export class TimeoutError extends Error {
  readonly ms: number

  constructor(label: string, ms: number) {
    super(`${label} did not complete within ${ms} ms`)
    this.name = 'TimeoutError'
    this.ms = ms
  }
}

export function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  const controller = new AbortController()
  let timer: NodeJS.Timeout | undefined

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new TimeoutError(label, ms)
      controller.abort(err)
      reject(err)
    }, ms)
  })

  return Promise.race([run(controller.signal), deadline]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export const isTimeout = (err: unknown): err is TimeoutError =>
  err instanceof TimeoutError ||
  (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'))
