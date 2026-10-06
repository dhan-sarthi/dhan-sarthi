import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatTitle, routeKey, routeTitle } from './title.ts'

test('every page has a title from its address alone', () => {
  assert.equal(formatTitle(routeTitle('/')), 'Today · RM Desk')
  assert.equal(formatTitle(routeTitle('/book')), 'Book · RM Desk')
  assert.equal(formatTitle(routeTitle('/insights')), 'Insights · RM Desk')
  assert.equal(formatTitle(routeTitle('/record')), 'Advice record · RM Desk')
  assert.equal(formatTitle(routeTitle('/access')), 'Access log · RM Desk')
  assert.equal(formatTitle(routeTitle('/login')), 'Sign in · RM Desk')
  assert.equal(formatTitle(routeTitle('/nope')), 'Not found · RM Desk')
  assert.equal(routeTitle('/customers/IDBI1/money'), 'Customer file · Money')
  assert.equal(routeTitle('/customers/IDBI1'), 'Customer file · Overview')
  assert.equal(routeTitle('/customers/IDBI1/nope'), 'Not found')
})

test('a page names itself in front of the suffix, and missing parts are left out', () => {
  assert.equal(formatTitle('Karan Deshpande', 'Money'), 'Karan Deshpande · Money · RM Desk')
  assert.equal(formatTitle(null, 'Book (38)'), 'Book (38) · RM Desk')
})

test("a customer file's tabs are one page; everything else is its own", () => {
  assert.equal(routeKey('/customers/IDBI1/money'), routeKey('/customers/IDBI1'))
  assert.notEqual(routeKey('/customers/IDBI1'), routeKey('/customers/IDBI2'))
  assert.equal(routeKey('/book/'), '/book')
})
