/**
 * The engine version stamped on every snapshot and advice record.
 *
 * A rule change is a new engine version and therefore a new snapshot row, which is how a
 * verdict recorded last month stays reproducible after the rules move: `pnpm replay` runs the
 * version the record names. The core package's own version plus the build's git sha is enough
 * to identify that.
 */
export function engineVersion(coreVersion: string, gitSha: string | undefined): string {
  return `@dhan/core@${coreVersion}+${gitSha ? gitSha.slice(0, 12) : 'dev'}`
}
