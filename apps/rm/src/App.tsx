import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { makeQueryClient } from './api/queries.ts'
import { useSession } from './api/session.ts'
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
import { RoutePage } from './shell/RouteBoundary.tsx'
import {
  AccessFallback,
  BookFallback,
  CustomerFallback,
  CustomerTabFallback,
  InsightsFallback,
  RecordFallback,
  TodayFallback,
} from './shell/RouteFallbacks.tsx'
import { Toaster, TooltipProvider } from './ui/index.ts'

/**
 * The style guide renders every kit component with hand-written sample props. Dev only: in a
 * production build `import.meta.env.DEV` is false, the branch is dead, and the chunk is never
 * emitted, so nothing of it ships.
 */
const Kit = import.meta.env.DEV ? lazy(() => import('./pages/Kit.tsx')) : null

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
 * Sign-in is in the first chunk, so the first thing an RM sees never waits on a second request.
 * Every page behind it is its own chunk (`shell/pages.ts`), shown under its own skeleton until
 * the code arrives, and fetched ahead once the shell is up.
 */
const tab = (page: ReactNode) => <RoutePage fallback={<CustomerTabFallback />}>{page}</RoutePage>

export function App() {
  const [client] = useState(makeQueryClient)
  useClearCacheOnSignOut(client)

  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
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
                    <RoutePage fallback={<TodayFallback />}>
                      <Today />
                    </RoutePage>
                  }
                />
                <Route
                  path="book"
                  element={
                    <RoutePage fallback={<BookFallback />}>
                      <Book />
                    </RoutePage>
                  }
                />
                <Route
                  path="customers/:cif"
                  element={
                    <RoutePage fallback={<CustomerFallback />}>
                      <Customer />
                    </RoutePage>
                  }
                >
                  <Route index element={tab(<CustomerOverview />)} />
                  <Route path="journey" element={tab(<CustomerJourney />)} />
                  <Route path="money" element={tab(<CustomerMoney />)} />
                  <Route path="goals" element={tab(<CustomerGoals />)} />
                  <Route path="record" element={tab(<CustomerRecord />)} />
                </Route>
                <Route
                  path="insights"
                  element={
                    <RoutePage fallback={<InsightsFallback />}>
                      <Insights />
                    </RoutePage>
                  }
                />
                <Route
                  path="record"
                  element={
                    <RoutePage fallback={<RecordFallback />}>
                      <Record />
                    </RoutePage>
                  }
                />
                <Route
                  path="access"
                  element={
                    <RoutePage fallback={<AccessFallback />}>
                      <Access />
                    </RoutePage>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
          <Toaster />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}
