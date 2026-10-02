import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { makeQueryClient } from './api/queries.ts'
import { useSession } from './api/session.ts'
import { Access } from './pages/access/Access.tsx'
import { Book } from './pages/book/Book.tsx'
import { Customer } from './pages/customer/Customer.tsx'
import { CustomerGoals } from './pages/customer/Goals.tsx'
import { CustomerJourney } from './pages/customer/Journey.tsx'
import { CustomerMoney } from './pages/customer/Money.tsx'
import { CustomerOverview } from './pages/customer/Overview.tsx'
import { CustomerRecord } from './pages/customer/RecordTab.tsx'
import { Insights } from './pages/insights/Insights.tsx'
import { Login } from './pages/login/Login.tsx'
import { NotFound } from './pages/NotFound.tsx'
import { Record } from './pages/record/Record.tsx'
import { Today } from './pages/today/Today.tsx'
import { RequireAuth } from './shell/RequireAuth.tsx'
import { Toaster, TooltipProvider } from './ui/index.ts'

/**
 * The style guide renders every kit component with hand-written sample props. Dev only: in a
 * production build `import.meta.env.DEV` is false, the branch is dead, and the chunk is never
 * emitted, so nothing of it ships.
 */
const Kit = import.meta.env.DEV ? lazy(() => import('./pages/Kit.tsx')) : null

/** The cache belongs to one RM: when the session ends, for any reason, it goes with it. */
function useClearCacheOnSignOut(client: ReturnType<typeof makeQueryClient>) {
  const session = useSession()
  useEffect(() => {
    if (session === null) client.clear()
  }, [session, client])
}

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
                <Route index element={<Today />} />
                <Route path="book" element={<Book />} />
                <Route path="customers/:cif" element={<Customer />}>
                  <Route index element={<CustomerOverview />} />
                  <Route path="journey" element={<CustomerJourney />} />
                  <Route path="money" element={<CustomerMoney />} />
                  <Route path="goals" element={<CustomerGoals />} />
                  <Route path="record" element={<CustomerRecord />} />
                </Route>
                <Route path="insights" element={<Insights />} />
                <Route path="record" element={<Record />} />
                <Route path="access" element={<Access />} />
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
