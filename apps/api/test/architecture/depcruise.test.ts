/**
 * The layering as a test: dependency-cruiser over the source with the rules in
 * .dependency-cruiser.cjs, plus a grep that keeps `process.env` inside config.ts.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..')
const API_SRC = join(REPO_ROOT, 'apps/api/src')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (full.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('architecture', () => {
  it('honours the dependency rules', () => {
    const bin = join(REPO_ROOT, 'node_modules/.bin/depcruise')
    const result = spawnSync(
      bin,
      [
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'err',
        'apps/api/src',
        'packages/core/src',
        'packages/contracts/src',
        'packages/fixtures/src',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    )
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  })

  it('reads process.env only in config.ts', () => {
    const offenders = walk(API_SRC)
      .filter((f) => !f.endsWith('/config.ts'))
      .filter((f) => /process\.env\b/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(REPO_ROOT, f))
    assert.deepEqual(offenders, [])
  })

  it('keeps every port file free of runtime imports', () => {
    const ports = walk(join(API_SRC, 'ports'))
    for (const file of ports) {
      const source = readFileSync(file, 'utf8')
      const valueImports = source
        .split('\n')
        .filter((line) => /^import\s/.test(line) && !/^import\s+type\s/.test(line))
      assert.deepEqual(valueImports, [], relative(REPO_ROOT, file))
    }
  })
})
