import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  matchCustomer,
  matchPage,
  normalise,
  rankBy,
  rankCustomers,
  TYPO_SCORE,
  withinOneEdit,
} from './search.ts'

// Invented people, shaped to reproduce what the walk found: a loose subsequence filter listed
// a Singh in Delhi and a Wankhede in Nagpur for "Sneha".
const BOOK = [
  { name: 'Gurdeep Singh', cif: 'IDBI0001112223', city: 'Delhi' },
  { name: 'Prakash Wadekar', cif: 'IDBI0004445556', city: 'Nagpur' },
  { name: 'Sneha Patil', cif: 'IDBI0007770001', city: 'Mumbai' },
  { name: 'Ananya Snehal Rao', cif: 'IDBI0009990002', city: 'Pune' },
  { name: 'Karan Deshmukh', cif: 'IDBI0003330003', city: 'Pune' },
  { name: 'Kavi Menon', cif: 'IDBI0006660004', city: 'Kochi' },
] as const

const names = (query: string): string[] =>
  rankBy(BOOK, (c) => matchCustomer(query, c)?.score ?? null).map((c) => c.name)

test('a name finds that person first and nobody unrelated', () => {
  assert.deepEqual(names('Sneha'), ['Sneha Patil', 'Ananya Snehal Rao'])
  assert.deepEqual(names('sneha patil'), ['Sneha Patil'])
  assert.equal(matchCustomer('Sneha', BOOK[0]), null)
  assert.equal(matchCustomer('Sneha', BOOK[1]), null)
})

test('the start of any word in the name, in any order', () => {
  assert.deepEqual(names('desh'), ['Karan Deshmukh'])
  assert.deepEqual(names('desh kar'), ['Karan Deshmukh'])
  const m = matchCustomer('desh', BOOK[4])
  assert.equal(m?.field, 'name')
  assert.deepEqual(m?.highlight, [6, 10])
})

test('exact beats prefix beats word start', () => {
  const exact = matchCustomer('sneha patil', BOOK[2])?.score ?? 0
  const prefix = matchCustomer('sneha', BOOK[2])?.score ?? 0
  const word = matchCustomer('sneh', BOOK[3])?.score ?? 0
  assert.ok(exact > prefix && prefix > word)
})

test('a CIF matches whole, from the front, or by its last digits', () => {
  assert.deepEqual(names('IDBI0007770001'), ['Sneha Patil'])
  assert.deepEqual(names('idbi 0007770001'), ['Sneha Patil'])
  assert.deepEqual(names('IDBI00044'), ['Prakash Wadekar'])
  assert.deepEqual(names('0004'), ['Kavi Menon'])
  assert.equal(matchCustomer('IDBI0007770001', BOOK[2])?.field, 'cif')
})

test('a city lists the people there, after any name match', () => {
  assert.deepEqual(names('Pune'), ['Ananya Snehal Rao', 'Karan Deshmukh'])
  assert.deepEqual(names('sneha mum'), ['Sneha Patil'])
})

test('one typo is forgiven in a longer word, never a weak subsequence', () => {
  assert.deepEqual(names('Snhea'), ['Sneha Patil', 'Ananya Snehal Rao'])
  assert.deepEqual(names('Wadeker'), ['Prakash Wadekar'])
  // Too short to forgive, and the first letter has to be right.
  assert.deepEqual(names('Ravi'), [])
  assert.deepEqual(names('snp'), [])
})

test('a typo is a fallback, never padding under a real match', () => {
  const book = [
    { name: 'Karan Deshpande', cif: 'IDBI0003308471', city: 'Pune' },
    { name: 'Kiran Desai', cif: 'IDBI0003749901', city: 'Ahmedabad' },
    { name: 'Shruti Deshmukh', cif: 'IDBI0009934410', city: 'Pune' },
    { name: 'Sneha Kulkarni', cif: 'IDBI0007731205', city: 'Mumbai' },
  ]
  const found = (q: string, limit?: number) =>
    rankCustomers(q, book, limit).map(({ row }) => row.name)
  // "desh" is one letter from "desa", but two people start with it, so Desai is not listed.
  assert.equal(matchCustomer('desh', book[1]!)?.score, TYPO_SCORE)
  assert.deepEqual(found('desh'), ['Karan Deshpande', 'Shruti Deshmukh'])
  // With nothing better, the typo is the answer.
  assert.deepEqual(found('Snea'), ['Sneha Kulkarni'])
  assert.deepEqual(found('Kirn Desai'), ['Kiran Desai'])
  assert.deepEqual(found('Zubin'), [])
  assert.deepEqual(found('pune', 1), ['Karan Deshpande'])
  const [first] = rankCustomers('1205', book)
  assert.equal(first?.match.field, 'cif')
})

test('pages match on their name, then their hint', () => {
  const pages = [
    { label: 'Today', hint: 'Who to call today, and why' },
    { label: 'Advice record', hint: 'Every refusal, hash-chained' },
    { label: 'Access log', hint: 'Every file you opened, and why' },
  ]
  const found = (q: string) => rankBy(pages, (p) => matchPage(q, p)).map((p) => p.label)
  assert.deepEqual(found('rec'), ['Advice record'])
  assert.deepEqual(found('a'), ['Advice record', 'Access log'])
  assert.deepEqual(found('refusal'), ['Advice record'])
  assert.deepEqual(found('sneha'), [])
})

test('helpers', () => {
  assert.equal(normalise('  Ánanya   RAO '), 'ananya rao')
  assert.equal(withinOneEdit('sneha', 'snhea'), true)
  assert.equal(withinOneEdit('sneha', 'sneh'), true)
  assert.equal(withinOneEdit('sneha', 'shena'), false)
  assert.deepEqual(
    rankBy([3, 1, 2], (n) => (n === 2 ? null : n), 1),
    [3],
  )
})
