import { QueryClientProvider } from '@tanstack/react-query'
import { LazyMotion, MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { makeQueryClient, queries } from './api/queries.ts'
import { useSession } from './api/session.ts'
import { loadMotionFeatures } from './lib/motion.ts'
import { Login } from './pages/login/Login.tsx'
import { NotFound } from './pages/NotFound.tsx'
import {
  Access,
  Book,
  Customer,
  CustomerGoals,
  CustomerJourney,
  CustomerMoney,
  CustomerOverview,
  CustomerRecord,
  Insights,
  Record,
  Today,
} from './shell/pages.ts'
import { clearRecentCustomers } from './shell/recent.ts'
import { RequireAuth } from './shell/RequireAuth.tsx'
import { RouteAnnouncer } from './shell/RouteAnnouncer.tsx'
import { RoutePage, type RoutePrefetch } from './shell/RouteBoundary.tsx'
import {
  AccessFallback,
  BookFallback,
  CustomerFallback,
  CustomerTabFallback,
  InsightsFallback,
  RecordFallback,
  TodayFallback,
} from './shell/RouteFallbacks.tsx'
import { TooltipProvider } from './ui/index.ts'

/**
 * The style guide renders every kit component with hand-written sample props. Dev only: in a
 * production build `import.meta.env.DEV` is false, the branch is dead, and the chunk is never
 * emitted, so nothing of it ships.
 */
const Kit = import.meta.env.DEV ? lazy(() => import('./pages/Kit.tsx')) : null

/** The toast host, with the toast library, in a chunk of its own after the first paint. */
const Toaster = lazy(() => import('./ui/Toaster.tsx').then((m) => ({ default: m.Toaster })))

/**
 * The cache belongs to one RM: when the session ends, for any reason, it goes with it, and so
 * does the list of customers they opened.
 */
function useClearCacheOnSignOut(client: ReturnType<typeof makeQueryClient>) {
  const session = useSession()
  useEffect(() => {
    if (session === null) {
      client.clear()
      clearRecentCustomers()
    }
  }, [session, client])
}

/*
 * What each route asks for first, started beside its chunk (`RoutePage`). Module-level, so a
 * route's prefetch is the same function on every render.
 */
const PREFETCH = {
  today: () => [queries.today(), queries.refusals()],
  book: () => [queries.book()],
  customer: (cif) => (cif ? [queries.customer(cif)] : []),
  journey: (cif) => (cif ? [queries.journey(cif)] : []),
  customerRecord: (cif) => (cif ? [queries.record(cif)] : []),
  insights: () => [queries.insights()],
  record: () => [queries.refusals()],
  access: () => [queries.accessLog()],
} satisfies Record<string, RoutePrefetch>

/*
 * Sign-in is in the first chunk, so the first thing an RM sees never waits on a second request.
 * Every page behind it is its own chunk (`shell/pages.ts`), shown under its own skeleton until
 * the code arrives, and fetched ahead once the shell is up.
 */
const tab = (page: ReactNode, prefetch?: RoutePrefetch) => (
  <RoutePage fallback={<CustomerTabFallback />} {...(prefetch ? { prefetch } : {})}>
    {page}
  </RoutePage>
)

export function App() {
  const [client] = useState(makeQueryClient)
  useClearCacheOnSignOut(client)

  return (
    <QueryClientProvider client={client}>
      {/* The animation features arrive in their own chunk after the first paint (`lib/motion.ts`). */}
      <LazyMotion features={loadMotionFeatures}>
        <MotionConfig reducedMotion="user">
          <TooltipProvider>
            <BrowserRouter basename={import.meta.env.BASE_URL}>
              <RouteAnnouncer />
              <Routes>
                <Route path="/login" element={<Login />} />
                {Kit ? (
                  <Route
                    path="/kit"
                    element={
                      <Suspense fallback={null}>
                        <Kit />
                      </Suspense>
                    }
                  />
                ) : null}
                <Route element={<RequireAuth />}>
                  <Route
                    index
                    element={
                      <RoutePage fallback={<TodayFallback />} prefetch={PREFETCH.today}>
                        <Today />
                      </RoutePage>
                    }
                  />
                  <Route
                    path="book"
                    element={
                      <RoutePage fallback={<BookFallback />} prefetch={PREFETCH.book}>
                        <Book />
                      </RoutePage>
                    }
                  />
                  <Route
                    path="customers/:cif"
                    element={
                      <RoutePage fallback={<CustomerFallback />} prefetch={PREFETCH.customer}>
                        <Customer />
                      </RoutePage>
                    }
                  >
                    <Route index element={tab(<CustomerOverview />)} />
                    <Route path="journey" element={tab(<CustomerJourney />, PREFETCH.journey)} />
                    <Route path="money" element={tab(<CustomerMoney />)} />
                    <Route path="goals" element={tab(<CustomerGoals />)} />
                    <Route
                      path="record"
                      element={tab(<CustomerRecord />, PREFETCH.customerRecord)}
                    />
                  </Route>
                  <Route
                    path="insights"
                    element={
                      <RoutePage fallback={<InsightsFallback />} prefetch={PREFETCH.insights}>
                        <Insights />
                      </RoutePage>
                    }
                  />
                  <Route
                    path="record"
                    element={
                      <RoutePage fallback={<RecordFallback />} prefetch={PREFETCH.record}>
                        <Record />
                      </RoutePage>
                    }
                  />
                  <Route
                    path="access"
                    element={
                      <RoutePage fallback={<AccessFallback />} prefetch={PREFETCH.access}>
                        <Access />
                      </RoutePage>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </BrowserRouter>
            <Suspense fallback={null}>
              <Toaster />
            </Suspense>
          </TooltipProvider>
        </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  )
}
