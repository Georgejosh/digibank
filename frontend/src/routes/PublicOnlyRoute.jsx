import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

/**
 * The mirror of ProtectedRoute: keeps a signed-in user off /login and
 * /register. Without it, tapping "back" after logging in lands on the login
 * form with a live session, which is confusing.
 *
 * /verify-otp is exempt: sign-up leaves the user anonymous until the code is
 * confirmed, so it must stay reachable while logged out AND after a login that
 * requires step-up verification later.
 */
export function PublicOnlyRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null; // ProtectedRoute renders the splash; avoid two
  if (isAuthenticated && location.pathname !== '/verify-otp') {
    return <Navigate to="/app/dashboard" replace />;
  }
  return <Outlet />;
}

export default PublicOnlyRoute;
