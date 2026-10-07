import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Logo } from '@/components/layout/Logo';

/**
 * Gate for everything under /app.
 *
 * While the boot refresh is in flight we must render NEITHER the dashboard nor
 * the login page: showing /login for a moment and then bouncing the user to the
 * dashboard is the classic "flash of logged-out UI" bug.
 *
 * This is a UX gate only. The Django API authorises every request on its own -
 * a user who edits this component still gets 401s from the server.
 */
export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink-50">
        <Logo size="lg" />
        <p role="status" className="text-sm text-ink-500">
          Restoring your session...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // `state.from` lets the login screen send them back where they were going.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
