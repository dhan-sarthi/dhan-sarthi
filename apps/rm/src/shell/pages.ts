/**
 * Every page behind the sign-in, loaded on demand.
 *
 * One bundle held the whole console (1,030 kB, over the 900 kB warning): an RM signing in
 * downloaded the copilot, the ledger and five customer tabs before seeing Today. Each page is now
 * its own chunk and sign-in stays in the first one, so the sign-in page is as quick as it can be.
 *
 * Once the page on screen has its data, `preloadPagesWhenSettled` fetches the others' code in
 * the background, the likeliest next pages first, so moving between pages never waits on the
 * network after the first minute and a preload never competes with the page's own requests. A
 * page whose code is already here renders at once: `lazyPage` draws the loaded module
 * synchronously, so Back, Forward and a first visit after the preload never show a skeleton.
 * A cold deep link (a bookmark to a customer) shows that page's skeleton while its chunk and its
 * data load side by side (`RouteBoundary.tsx`).
 */
import type { QueryClient } from '@tanstack/react-query'
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'

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

type PageId = keyof typeof load

/**
 * The skeleton of the route a page is drawn in (`RoutePage` provides it), which a page shows
 * itself while its chunk is on the way.
 */
export const PageFallback = createContext<ReactNode>(null)

const modules = new Map<PageId, unknown>()
const pending = new Map<PageId, Promise<unknown>>()

/** Fetches a page's chunk once; a failure is forgotten, so the next attempt asks again. */
function preload(id: PageId): Promise<unknown> {
  let promise = pending.get(id)
  if (!promise) {
    promise = load[id]().then(
      (m) => {
        modules.set(id, m)
        return m
      },
      (error: unknown) => {
        pending.delete(id)
        throw error
      },
    )
    pending.set(id, promise)
  }
  return promise
}

/**
 * A page over its own chunk that never suspends. Once the chunk is here, whether the page asked
 * for it or the background preload fetched it, the page draws at once. Until then it shows its
 * route's skeleton itself and draws when the chunk lands, as an ordinary update.
 *
 * Not `React.lazy`: a lazy page suspends, and React holds back the content that replaces a
 * Suspense fallback until 300 ms after the fallback appeared (its reveal throttle). On a cold load
 * the chunk and the page's data are both in within about 50 ms, so the throttle alone set the
 * page's LCP at about 380 ms. A chunk that fails to load is thrown to the route's error boundary,
 * as a lazy page's would be.
 */
function lazyPage<Id extends PageId, Name extends keyof Awaited<ReturnType<(typeof load)[Id]>>>(
  id: Id,
  name: Name,
  before?: () => void,
): ComponentType {
  type Module = Awaited<ReturnType<(typeof load)[Id]>>
  function Page() {
    const fallback = useContext(PageFallback)
    const [loaded, setLoaded] = useState(() => modules.get(id) as Module | undefined)
    const [failed, setFailed] = useState<{ error: unknown } | null>(null)
    useEffect(() => {
      before?.()
      if (loaded !== undefined) return
      let live = true
      ;(preload(id) as Promise<Module>).then(
        (m) => live && setLoaded(m),
        (error: unknown) => live && setFailed({ error }),
      )
      return () => {
        live = false
      }
    }, [loaded])
    if (failed) throw failed.error
    if (loaded === undefined) return fallback
    return createElement(loaded[name] as ComponentType)
  }
  Page.displayName = `Page(${String(name)})`
  return Page
}

/** The five tabs travel together: whichever one a link opens, the next click is another. */
function loadCustomerTabs(): void {
  for (const tab of ['overview', 'journey', 'money', 'goals', 'customerRecord'] as const) {
    void preload(tab).catch(() => undefined)
  }
}

export const Today = lazyPage('today', 'Today')
export const Book = lazyPage('book', 'Book')
export const Customer = lazyPage('customer', 'Customer', loadCustomerTabs)
export const CustomerOverview = lazyPage('overview', 'CustomerOverview')
export const CustomerJourney = lazyPage('journey', 'CustomerJourney')
export const CustomerMoney = lazyPage('money', 'CustomerMoney')
export const CustomerGoals = lazyPage('goals', 'CustomerGoals')
export const CustomerRecord = lazyPage('customerRecord', 'CustomerRecord')
export const Insights = lazyPage('insights', 'Insights')
export const Record = lazyPage('record', 'Record')
export const Access = lazyPage('access', 'Access')

/* ---------------------------------------------------------------- Background preload */

const CUSTOMER_FILE: readonly PageId[] = [
  'customer',
  'overview',
  'journey',
  'money',
  'goals',
  'customerRecord',
]
const EVERY_PAGE = Object.keys(load) as PageId[]

/**
 * What to fetch first, by the page the RM is on: from Today the next click is a customer (a call)
 * or the Book; from the Book it is a customer; anywhere else, Today and the Book. The rest follow
 * in a second, later pass.
 */
export function preloadOrder(route: string): PageId[][] {
  const first: PageId[] =
    route === '/'
      ? ['book', ...CUSTOMER_FILE]
      : route === '/book'
        ? [...CUSTOMER_FILE, 'today']
        : route.startsWith('/customers/')
          ? ['book', 'today']
          : ['today', 'book', ...CUSTOMER_FILE]
  return [first, EVERY_PAGE.filter((id) => !first.includes(id))]
}

/** How long to wait for the page's data before preloading anyway (a failing API, say). */
const SETTLE_TIMEOUT_MS = 8_000

function whenIdle(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 4000 })
    return () => window.cancelIdleCallback(id)
  }
  const timer = window.setTimeout(fn, 1500)
  return () => window.clearTimeout(timer)
}

/**
 * Fetches the other pages' code once the page on screen has settled: at least one of its reads
 * has answered and none is still in flight, and the browser is idle. The likeliest pages go
 * first and the rest in a second idle pass, so the speculative downloads never share the line
 * with the data the RM is waiting for. Code only: no page's data is fetched ahead, since opening
 * a customer is an access-logged read. Returns a cancel.
 */
export function preloadPagesWhenSettled(client: QueryClient, route: string): () => void {
  const stages = preloadOrder(route)
  const cache = client.getQueryCache()
  let cancelIdle: (() => void) | null = null
  let done = false

  const run = (stage: number) => {
    const ids = stages[stage]
    if (done || !ids) return
    cancelIdle = whenIdle(() => {
      void Promise.allSettled(ids.map((id) => preload(id))).then(() => run(stage + 1))
    })
  }
  const start = () => {
    if (done || cancelIdle) return
    unsubscribe()
    window.clearTimeout(fallback)
    run(0)
  }
  const check = () => {
    const answered = cache.getAll().some((q) => q.state.status === 'success')
    if (answered && client.isFetching() === 0) start()
  }
  const unsubscribe = cache.subscribe(check)
  const fallback = window.setTimeout(start, SETTLE_TIMEOUT_MS)
  check()

  return () => {
    done = true
    unsubscribe()
    window.clearTimeout(fallback)
    cancelIdle?.()
  }
}
