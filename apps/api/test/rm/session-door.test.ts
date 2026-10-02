/**
 * `POST /sessions` opens the picker's customers and nobody else.
 *
 * The bank holds all fifty customers so the RM book can read them, and the public route used to
 * open a session on any of them: no sign-in, no book, no access-log entry, and the session's
 * history seeding wrote months of decisions and advice onto a book customer's record, which the
 * console then reads back as that customer's own journey. A book customer must answer exactly
 * as a cif that does not exist, so the route also cannot be used to tell the two apart.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { ErrorBody } from '@dhan/contracts'
import { SessionService } from '../../src/application/session.service.ts'
import { InMemorySessionStore } from '../../src/adapters/memory/session-store.memory.ts'
import type { BankDataPort } from '../../src/ports/index.ts'
import { ANCHOR, ROHAN_CIF, makeRoot } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

describe('the customer session door', () => {
  let root: TestRoot
  let bookOnly: string

  before(async () => {
    root = await makeRoot()
    const picker = new Set((await root.deps.bank.listCustomers()).map((c) => c.cif))
    const population = await root.deps.bank.listPopulation()
    const cif = population.find((c) => !picker.has(c.cif))?.cif
    assert.ok(cif, 'the population holds customers the picker does not list')
    bookOnly = cif
  })
  after(() => root.close())

  const open = (cif: string) =>
    root.app.inject({ method: 'POST', url: '/api/v1/sessions', payload: { cif } })

  it('opens a customer on the picker', async () => {
    const res = await open(ROHAN_CIF)
    assert.equal(res.statusCode, 200, res.body)
  })

  it('answers a book-only cif with the 404 an unknown cif gets, and writes nothing', async () => {
    const book = await open(bookOnly)
    const unknown = await open('IDBI0000000000')
    assert.equal(book.statusCode, 404, book.body)
    assert.equal(unknown.statusCode, 404)
    const [b, u] = [book.json<ErrorBody>(), unknown.json<ErrorBody>()]
    assert.equal(b.code, 'NOT_FOUND')
    // The same words but for the cif each names, so the answer says nothing about the book.
    assert.equal(b.message.replace(bookOnly, '<cif>'), u.message.replace('IDBI0000000000', '<cif>'))
    assert.deepEqual(Object.keys(b).sort(), Object.keys(u).sort())
    assert.deepEqual(await root.deps.sessions.listByCif(bookOnly), [])
  })

  it('still opens any customer the bank holds where there is no picker (Phase 2)', async () => {
    // The host app names the customer there, so there is no list to hold the cif against.
    const bank: BankDataPort = Object.create(root.deps.bank, {
      listCustomers: { value: async () => [] },
    })
    const sessions = new SessionService({
      sessions: new InMemorySessionStore(root.clock),
      bank,
      clock: root.clock,
      anchor: ANCHOR,
      avatarName: 'none',
    })
    const { session } = await sessions.open(bookOnly)
    assert.equal(session.cif, bookOnly)
    await assert.rejects(sessions.open('IDBI0000000000'), { status: 404 })
  })
})
