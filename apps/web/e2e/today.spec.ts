import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { DecisionResponse, View } from '@dhan/contracts'
import { writeFile } from 'node:fs/promises'

const PEOPLE = ['Rohan Mehta', 'Priya Nair', 'Sunil Kumar']
const PHONES = [
  { width: 390, height: 844 },
  { width: 375, height: 812 },
]

async function pick(page: Page, name: string): Promise<View> {
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/view') && r.status() === 200,
  )
  await page.getByRole('button', { name: new RegExp(name) }).click()
  const view = (await (await response).json()) as View
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: "Today's action" })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Do it', exact: true })).toBeEnabled()
  return view
}

for (const viewport of PHONES) {
  for (const name of PEOPLE) {
    test(`${name}: both decisions fit at rest on ${viewport.width}×${viewport.height}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport)
      await page.goto('/')
      const view = await pick(page, name)
      const card = page.getByRole('region', { name: "Today's action" })
      await expect(card.getByRole('heading')).toHaveText(view.plan.primary?.label ?? '')
      const scroll = await page.locator('.scroll').evaluate((el) => ({
        top: el.scrollTop,
        bottom: el.getBoundingClientRect().bottom,
      }))
      expect(scroll.top).toBe(0)
      const tabbar = await page.getByRole('navigation', { name: 'Sections' }).boundingBox()
      expect(tabbar).not.toBeNull()
      const measurements: Record<string, unknown> = { viewport, scroll, tabbar }
      for (const label of ['Do it', 'Not now']) {
        const button = card.getByRole('button', { name: label, exact: true })
        await expect(button).toBeInViewport({ ratio: 1 })
        const box = await button.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.height).toBeGreaterThanOrEqual(44)
        expect(box!.width).toBeGreaterThanOrEqual(44)
        expect(box!.y + box!.height).toBeLessThanOrEqual(scroll.bottom)
        expect(box!.y + box!.height).toBeLessThan(tabbar!.y)
        const hit = await button.evaluate((el) => {
          const b = el.getBoundingClientRect()
          return el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2))
        })
        expect(hit).toBe(true)
        measurements[label] = box
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      await writeFile(
        testInfo.outputPath('fold-measurements.json'),
        JSON.stringify(measurements, null, 2),
      )
      await page.screenshot({ path: testInfo.outputPath('first-screenful.png') })
    })
  }
}

test('Not now records deferred intent and the action stays decided after reload', async ({
  page,
}) => {
  await page.setViewportSize(PHONES[0]!)
  await page.goto('/')
  const view = await pick(page, PEOPLE[0]!)
  const response = page.waitForResponse((r) => r.url().includes('/decision'))
  await page.getByRole('button', { name: 'Not now', exact: true }).click()
  const recorded = await response
  expect(recorded.request().postDataJSON()).toEqual({ kind: 'deferred' })
  expect(recorded.ok()).toBe(true)
  const result = (await recorded.json()) as DecisionResponse
  expect(result.decision.kind).toBe('deferred')
  expect(result.decision.actionId).toBe(view.plan.primary?.id)
  await page.getByRole('navigation').getByRole('button', { name: 'Record' }).click()
  await expect(page.getByText('Deferred', { exact: true })).toBeVisible()
  await page.reload()
  const card = page.getByRole('region', { name: "Today's action" })
  await expect(card.getByRole('button', { name: 'Do it', exact: true })).toBeEnabled()
  await expect(card.getByRole('heading')).not.toHaveText(view.plan.primary!.label)
  await expect(card.getByRole('heading')).toHaveText(view.plan.secondary[0]!.label)
  await page.getByRole('navigation').getByRole('button', { name: 'Record' }).click()
  await expect(page.getByText('Deferred', { exact: true })).toBeVisible()
})

test('a fresh session for the same customer can decide an action used in the previous session', async ({
  page,
}) => {
  await page.setViewportSize(PHONES[0]!)
  await page.goto('/')
  const first = await pick(page, PEOPLE[0]!)
  const firstResponse = page.waitForResponse((r) => r.url().includes('/decision'))
  await page.getByRole('button', { name: 'Not now', exact: true }).click()
  expect((await firstResponse).ok()).toBe(true)
  const card = page.getByRole('region', { name: "Today's action" })
  await expect(card.getByRole('heading')).toHaveText(first.plan.secondary[0]!.label)
  await page.getByRole('button', { name: 'Switch customer', exact: true }).click()
  const next = await pick(page, PEOPLE[0]!)
  // Identical advice may have the same id; only this session's decisions may suppress it.
  expect(next.plan.primary!.id).toBe(first.plan.primary!.id)
  await expect(card.getByRole('heading')).toHaveText(next.plan.primary!.label)
  const nextResponse = page.waitForResponse((r) => r.url().includes('/decision'))
  await card.getByRole('button', { name: 'Do it', exact: true }).click()
  const recorded = await nextResponse
  expect(recorded.ok()).toBe(true)
  expect(((await recorded.json()) as DecisionResponse).decision.actionId).toBe(
    next.plan.primary!.id,
  )
})

test('a failed record read after switching cannot show a previous session’s decisions', async ({
  page,
}) => {
  await page.setViewportSize(PHONES[0]!)
  await page.goto('/')
  const first = await pick(page, PEOPLE[0]!)
  const response = page.waitForResponse((r) => r.url().includes('/decision'))
  await page.getByRole('button', { name: 'Not now', exact: true }).click()
  expect((await response).ok()).toBe(true)
  await page.getByRole('navigation').getByRole('button', { name: 'Record' }).click()
  await expect(page.getByText('Deferred', { exact: true })).toBeVisible()
  await page.getByRole('navigation').getByRole('button', { name: 'Today' }).click()
  await page.getByRole('button', { name: 'Switch customer', exact: true }).click()
  await page.route('**/api/v1/record', (route) => route.abort())
  await page.getByRole('button', { name: new RegExp(PEOPLE[0]!) }).click()
  await expect(
    page.getByText('Your previous decisions could not be read. Open Record and try again.'),
  ).toBeVisible()
  const card = page.getByRole('region', { name: "Today's action" })
  await expect(card.getByRole('heading')).toHaveText(first.plan.primary!.label)
  await expect(card.getByRole('button', { name: 'Do it', exact: true })).toBeDisabled()
  await expect(card.getByRole('button', { name: 'Not now', exact: true })).toBeDisabled()
  await page.getByRole('navigation').getByRole('button', { name: 'Record' }).click()
  await expect(page.getByText('Deferred', { exact: true })).toHaveCount(0)
  await page.unroute('**/api/v1/record')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Today' }).click()
  await expect(card.getByRole('heading')).toHaveText(first.plan.primary!.label)
  await expect(card.getByRole('button', { name: 'Do it', exact: true })).toBeEnabled()
})

test('an insight reviews and submits the exact secondary action provided by the API', async ({
  page,
}) => {
  await page.setViewportSize(PHONES[0]!)
  await page.goto('/')
  const view = await pick(page, PEOPLE[0]!)
  const action =
    view.plan.secondary.find((a) => a.kind === 'set_category_cap') ?? view.plan.secondary[0]
  expect(action).toBeDefined()
  await page.getByRole('button', { name: `Review action: ${action!.label}`, exact: true }).click()
  const card = page.getByRole('region', { name: "Today's action" })
  await expect(card.getByRole('heading')).toHaveText(action!.label)
  await expect(card).toBeFocused()
  const response = page.waitForResponse((r) => r.url().includes('/decision'))
  await card.getByRole('button', { name: 'Do it', exact: true }).click()
  const recorded = await response
  expect(recorded.ok()).toBe(true)
  const result = (await recorded.json()) as DecisionResponse
  expect(result.decision.actionId).toBe(action!.id)
  expect(result.decision.kind).toBe('did_it')
})

test('the reviewer can cancel switching or open another customer without erasing the old session', async ({
  page,
  request,
}) => {
  await page.setViewportSize(PHONES[0]!)
  await page.goto('/')
  const first = await pick(page, PEOPLE[0]!)
  const previous = await page.evaluate(() => {
    const raw = localStorage.getItem('dhan.session.v2')
    return JSON.parse(raw ?? '{}') as { token: string; cif: string }
  })
  await page.getByRole('button', { name: 'Switch customer', exact: true }).click()
  await expect(page.getByRole('button', { name: /Priya Nair/ })).toBeVisible()
  await page.getByRole('button', { name: 'Return to current session' }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('dhan.session.v2'))).toBe(
    JSON.stringify(previous),
  )
  await page.getByRole('button', { name: 'Switch customer', exact: true }).click()
  const next = await pick(page, PEOPLE[1]!)
  expect(next.snapshot.customer.name).not.toBe(first.snapshot.customer.name)
  const original = await request.get('http://127.0.0.1:3101/api/v1/session', {
    headers: { Authorization: `Bearer ${previous.token}` },
  })
  expect(original.ok()).toBe(true)
  expect((await original.json()).cif).toBe(previous.cif)
})

test('moving a shop owner’s clock preserves the month boundary without a salary claim', async ({
  page,
}) => {
  await page.setViewportSize(PHONES[1]!)
  await page.goto('/')
  await pick(page, PEOPLE[2]!)
  await page.getByRole('button', { name: 'Move time' }).click()
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/view') && r.status() === 200,
  )
  await page.getByRole('button', { name: '+1 month', exact: true }).click()
  const view = (await (await response).json()) as View
  expect(view.snapshot.income.payDay).toBeNull()
  expect(view.plan.safeToSpend.incomeStability).toBe('variable')
  await page.getByRole('button', { name: 'Close clock' }).click()
  await expect(page.getByText(/left in this month/)).toBeVisible()
  await expect(page.getByText(/until your salary/)).toHaveCount(0)
})

test('switching offline creates the chosen customer’s simulation and keeps decisions disabled', async ({
  page,
}) => {
  await page.setViewportSize(PHONES[0]!)
  await page.goto('/')
  await pick(page, PEOPLE[0]!)
  await page.route('**/api/v1/**', (route) => route.abort())
  await page.reload()
  await expect(page.getByLabel('Data source')).toContainText('Simulated in this browser')
  await expect(page.locator('header')).toContainText('Rohan')
  await page.getByRole('button', { name: 'Switch customer', exact: true }).click()
  await page.getByRole('button', { name: /Priya Nair/ }).click()
  await expect(page.locator('header')).toContainText('Priya')
  await expect(page.locator('header')).not.toContainText('Rohan')
  await expect(page.getByLabel('Data source')).toContainText('Simulated in this browser')
  await expect(page.getByRole('button', { name: 'Do it', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Not now', exact: true })).toBeDisabled()
})

test('Money counts a deposit held in an account only once in net position', async ({ page }) => {
  await page.setViewportSize(PHONES[0]!)
  await page.goto('/')
  const view = await pick(page, PEOPLE[0]!)
  const { balances, holdings, debt } = view.snapshot
  expect(holdings.total).toBeGreaterThan(holdings.outsideAccounts)
  const net = balances.total + holdings.outsideAccounts - debt.total
  await page.getByRole('navigation').getByRole('button', { name: 'Money' }).click()
  const hero = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Net position' }) })
  await expect(hero.locator('.settle')).toContainText(Math.round(net).toLocaleString('en-IN'))
  await expect(hero.getByText('Other investments', { exact: true })).toBeVisible()
  await expect(page.getByText('Available to use', { exact: true })).toBeVisible()
})

test('an all-fixture sandbox view is visibly labelled as synthetic API replay', async ({
  page,
}) => {
  await page.setViewportSize(PHONES[0]!)
  await page.route('**/api/v1/view', async (route) => {
    const response = await route.fetch()
    const view = (await response.json()) as View
    view.meta.source = 'idbi-sandbox'
    view.meta.provenance = {
      PROFILE: 'fixture',
      ACCOUNTS: 'fixture',
      TXN: 'fixture',
      LIABILITIES: 'fixture',
      HOLDINGS: 'fixture',
    }
    await route.fulfill({ response, json: view })
  })
  await page.goto('/')
  await pick(page, PEOPLE[0]!)
  await expect(page.getByLabel('Data source')).toContainText('Synthetic API replay')
  await expect(page.getByLabel('Data source')).not.toContainText('IDBI sandbox')
})
