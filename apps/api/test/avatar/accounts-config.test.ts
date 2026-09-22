/**
 * How the environment spells the account chain: numbered slots (`RUNWAY_API_KEY_2`), the older
 * comma lists, and the provider order in `AVATAR_PROVIDER`.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ConfigError, avatarCredentials, loadConfig } from '../../src/config.ts'

const BASE = { NODE_ENV: 'test', BANK_SOURCE: 'memory' }

function issuesOf(env: Record<string, string>): string[] {
  try {
    loadConfig({ ...BASE, ...env })
  } catch (err) {
    if (err instanceof ConfigError) return err.issues.map((i) => `${i.key}: ${i.message}`)
    throw err
  }
  return []
}

describe('the avatar account chain in the environment', () => {
  it('still reads the comma lists when no slot is numbered', () => {
    const config = loadConfig({
      ...BASE,
      AVATAR_PROVIDER: 'runway',
      RUNWAY_API_KEY: 'a,b',
      RUNWAY_CHARACTER_ID: 'ca,cb',
    })
    assert.deepEqual(
      avatarCredentials(config).map((c) => [c.label, c.key, c.characterId]),
      [
        ['runway-1', 'a', 'ca'],
        ['runway-2', 'b', 'cb'],
      ],
    )
  })

  it('prefers numbered slots, skips blank placeholders, and keeps slot order', () => {
    const config = loadConfig({
      ...BASE,
      AVATAR_PROVIDER: 'runway',
      RUNWAY_API_KEY: 'legacy',
      RUNWAY_CHARACTER_ID: 'legacy-character',
      RUNWAY_API_KEY_1: 'one',
      RUNWAY_CHARACTER_ID_1: 'c1',
      // A placeholder the owner has not filled yet, as the .env ships it.
      RUNWAY_API_KEY_2: '',
      RUNWAY_CHARACTER_ID_2: '   ',
      RUNWAY_API_KEY_3: 'three',
      RUNWAY_CHARACTER_ID_3: 'c3',
    })
    assert.deepEqual(
      avatarCredentials(config).map((c) => c.label),
      ['runway-1', 'runway-3'],
    )
  })

  it('names the missing half of a half-filled slot', () => {
    const issues = issuesOf({
      AVATAR_PROVIDER: 'runway',
      RUNWAY_API_KEY_1: 'one',
      RUNWAY_CHARACTER_ID_1: 'c1',
      RUNWAY_API_KEY_2: 'two',
    })
    assert.ok(
      issues.some((i) => i.startsWith('RUNWAY_CHARACTER_ID_2')),
      issues.join('; '),
    )
  })

  it('orders providers as AVATAR_PROVIDER lists them, and gives each Anam account its own voice', () => {
    const config = loadConfig({
      ...BASE,
      AVATAR_PROVIDER: 'runway,anam',
      RUNWAY_API_KEY_1: 'one',
      RUNWAY_CHARACTER_ID_1: 'c1',
      ANAM_API_KEY_1: 'anam-one',
      ANAM_AVATAR_ID_1: 'a1',
      ANAM_API_KEY_2: 'anam-two',
      ANAM_AVATAR_ID_2: 'a2',
      ANAM_VOICE_ID_2: 'voice-two',
      ANAM_VOICE_ID: 'shared-voice',
      ANAM_LLM_ID: 'shared-llm',
      ANAM_PUBLIC_BASE_URL: 'https://gate.example.test',
    })
    const creds = avatarCredentials(config)
    assert.deepEqual(
      creds.map((c) => `${c.provider}:${c.label}`),
      ['runway:runway-1', 'anam:anam-1', 'anam:anam-2'],
    )
    assert.equal(creds[1]?.voiceId, undefined)
    assert.equal(creds[2]?.voiceId, 'voice-two')
  })

  it('refuses a named provider with no account, and none mixed with a provider', () => {
    assert.ok(issuesOf({ AVATAR_PROVIDER: 'runway' }).some((i) => i.startsWith('RUNWAY_API_KEY_1')))
    assert.ok(
      issuesOf({ AVATAR_PROVIDER: 'none,runway' }).some((i) => i.startsWith('AVATAR_PROVIDER')),
    )
  })

  it('still refuses Anam without a public URL for the tool gate', () => {
    const issues = issuesOf({
      AVATAR_PROVIDER: 'anam',
      ANAM_API_KEY_1: 'k',
      ANAM_AVATAR_ID_1: 'a',
      ANAM_VOICE_ID: 'v',
      ANAM_LLM_ID: 'l',
    })
    assert.ok(
      issues.some((i) => i.startsWith('ANAM_PUBLIC_BASE_URL')),
      issues.join('; '),
    )
  })

  it('treats one key given twice as one account', () => {
    const config = loadConfig({
      ...BASE,
      AVATAR_PROVIDER: 'runway',
      RUNWAY_API_KEY_1: 'same',
      RUNWAY_CHARACTER_ID_1: 'c1',
      RUNWAY_API_KEY_2: 'same',
      RUNWAY_CHARACTER_ID_2: 'c1',
    })
    assert.deepEqual(
      avatarCredentials(config).map((c) => c.label),
      ['runway-1'],
    )
  })
})
