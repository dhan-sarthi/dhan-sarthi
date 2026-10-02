/**
 * Every page behind the sign-in, loaded on demand.
 *
 * One bundle held the whole console (1,030 kB, over the 900 kB warning): an RM signing in
 * downloaded the copilot, the ledger and five customer tabs before seeing Today. Each page is now
 * its own chunk and sign-in stays in the first one, so the sign-in page is as quick as it can be.
 * Once the shell is up, `preloadPages` fetches the rest while the RM reads Today, so moving
 * between pages never waits on the network after the first minute; a cold deep link (a bookmark
 * to a customer) shows that page's skeleton for the moment its chunk takes.
 */
import { lazy } from 'react'

const load = {
  today: () => import('../pages/today/Today.tsx'),
  book: () => import('../pages/book/Book.tsx'),
  customer: () => import('../pages/customer/Customer.tsx'),
  overview: () => import('../pages/customer/Overview.tsx'),
  journey: () => import('../pages/customer/Journey.tsx'),
  money: () => import('../pages/customer/Money.tsx'),
  goals: () => import('../pages/customer/Goals.tsx'),
  customerRecord: () => import('../pages/customer/RecordTab.tsx'),
  insights: () => import('../pages/insights/Insights.tsx'),
  record: () => import('../pages/record/Record.tsx'),
  access: () => import('../pages/access/Access.tsx'),
}

/** The five tabs travel together: whichever one a link opens, the next click is another. */
function loadCustomerTabs(): void {
  for (const tab of [load.overview, load.journey, load.money, load.goals, load.customerRecord]) {
    void tab().catch(() => undefined)
  }
}

export const Today = lazy(() => load.today().then((m) => ({ default: m.Today })))
export const Book = lazy(() => load.book().then((m) => ({ default: m.Book })))
export const Customer = lazy(() => {
  loadCustomerTabs()
  return load.customer().then((m) => ({ default: m.Customer }))
})
export const CustomerOverview = lazy(() =>
  load.overview().then((m) => ({ default: m.CustomerOverview })),
)
export const CustomerJourney = lazy(() =>
  load.journey().then((m) => ({ default: m.CustomerJourney })),
)
export const CustomerMoney = lazy(() => load.money().then((m) => ({ default: m.CustomerMoney })))
export const CustomerGoals = lazy(() => load.goals().then((m) => ({ default: m.CustomerGoals })))
export const CustomerRecord = lazy(() =>
  load.customerRecord().then((m) => ({ default: m.CustomerRecord })),
)
export const Insights = lazy(() => load.insights().then((m) => ({ default: m.Insights })))
export const Record = lazy(() => load.record().then((m) => ({ default: m.Record })))
export const Access = lazy(() => load.access().then((m) => ({ default: m.Access })))

/**
 * Fetches every page's chunk without rendering anything. A failure here is ignored: the page
 * that needs the chunk asks again when it is opened, and says so if it still cannot load.
 */
export function preloadPages(): void {
  for (const page of Object.values(load)) void page().catch(() => undefined)
}

/** Runs `preloadPages` once the browser is idle (or after a short wait where it cannot say). */
export function preloadWhenIdle(): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(preloadPages, { timeout: 4000 })
    return () => window.cancelIdleCallback(id)
  }
  const timer = window.setTimeout(preloadPages, 1500)
  return () => window.clearTimeout(timer)
}
