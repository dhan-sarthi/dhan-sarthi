/**
 * Whose address a per-address limit keys on.
 *
 * With `TRUST_PROXY=true` Fastify trusts every hop, so `request.ip` is the leftmost
 * `X-Forwarded-For` entry. CloudFront appends to a forwarded header rather than replacing it, so
 * that entry is whatever the client wrote, and rotating it walked straight past the RM sign-in
 * limit. A hop count reads the address the last trusted proxy saw instead.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadConfig } from '../../src/config.ts'
import { createServer } from '../../src/http/server.ts'

const base = { NODE_ENV: 'test', BANK_SOURCE: 'memory', AVATAR_PROVIDER: 'none' }

async function ipBehind(trustProxy: string, forwardedFor: string): Promise<string> {
  const app = await createServer(loadConfig({ ...base, TRUST_PROXY: trustProxy }), {
    rateLimits: false,
    logger: false,
  })
  app.get('/ip', (request) => ({ ip: request.ip }))
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: '10.0.1.20',
      headers: { 'x-forwarded-for': forwardedFor },
    })
    return res.json<{ ip: string }>().ip
  } finally {
    await app.close()
  }
}

describe('TRUST_PROXY', () => {
  it('reads a whole number as a hop count, and keeps the booleans and address lists', () => {
    const read = (v: string) => loadConfig({ ...base, TRUST_PROXY: v }).TRUST_PROXY
    assert.equal(read('2'), 2)
    assert.equal(read('1'), 1)
    assert.equal(read('0'), false)
    assert.equal(read('true'), true)
    assert.equal(read('false'), false)
    assert.deepEqual(read('10.0.0.0/16, 127.0.0.1'), ['10.0.0.0/16', '127.0.0.1'])
    assert.equal(loadConfig(base).TRUST_PROXY, false)
    assert.throws(() => read('everyone'))
  })

  it('takes the address CloudFront saw two hops back, whatever the client prepended', async () => {
    // The client wrote 10.0.7.1; CloudFront appended the viewer; the ALB appended CloudFront.
    const chain = '10.0.7.1, 203.0.113.7, 130.176.10.4'
    assert.equal(await ipBehind('2', chain), '203.0.113.7')
    // What `true` did: the client's own entry.
    assert.equal(await ipBehind('true', chain), '10.0.7.1')
    // Off: the socket, whatever the header says.
    assert.equal(await ipBehind('false', chain), '10.0.1.20')
  })
})
