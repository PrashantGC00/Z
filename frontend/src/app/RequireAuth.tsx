import { Navigate, Outlet, useLocation } from 'react-router'
import { useIsSignedIn } from '@/stores/session'

/** Layout route: sends signed-out visitors to /login and brings them back afterwards. */
export function RequireAuth() {
  const signedIn = useIsSignedIn()
  const location = useLocation()
  if (!signedIn) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}
