import { Navigate, useLocation } from 'react-router'
import { useSession } from '../api/session.ts'
import { AppShell } from './AppShell.tsx'

/**
 * Every page but sign-in sits behind this. No session sends the RM to /login, remembering where
 * they were going; a session that the server rejects is cleared by the API client on its first
 * 401, which lands here on the next render and does the same.
 */
export function RequireAuth() {
  const session = useSession()
  const location = useLocation()
  if (!session) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to="/login" replace state={from === '/' ? null : { from }} />
  }
  return <AppShell session={session} />
}
