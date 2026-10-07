import { Suspense, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ShieldCheck, X } from 'lucide-react';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { SessionTimeout } from './SessionTimeout';
import { Logo } from './Logo';
import { RouteFallback } from '@/routes/RouteFallback';
import { useDashboardSummary } from '@/hooks/useDashboard';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { cn } from '@/utils/cn';

/**
 * The shell everything after login renders inside.
 *
 * The layout owns the two queries the CHROME needs (streak + unread count) so
 * the badges stay correct on every screen. Each page owns its own data.
 */
export function DashboardLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  const { data: summary } = useDashboardSummary();
  const unreadCount = useUnreadNotificationCount();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-ink-50">
      {/* Keyboard users should not have to tab the whole nav on every page. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-field focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-800 focus:shadow-card"
      >
        Skip to content
      </a>

      <div className="lg:flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-ink-200 bg-white lg:flex">
          <div className="flex h-16 items-center border-b border-ink-100 px-5">
            <Link to="/app/dashboard" aria-label="DigiBank home">
              <Logo size="sm" />
            </Link>
          </div>
          <Sidebar
            pendingApprovals={summary?.pending_approvals ?? 0}
            unreadNotifications={unreadCount}
          />
          <div className="mt-auto border-t border-ink-100 px-5 py-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-600">
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-success-600" />
              Protected session
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
              2-step sign-in · auto-lock after 10 min idle. Savings only - DigiBank never sends
              money between people.
            </p>
          </div>
        </aside>

        {/* Mobile drawer */}
        {navOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setNavOpen(false)}
              className="absolute inset-0 animate-fade-in bg-ink-900/45"
            />
            <div className="relative flex h-full w-72 max-w-[85vw] animate-slide-up flex-col border-r border-ink-200 bg-white">
              <div className="flex h-16 items-center justify-between border-b border-ink-100 px-4">
                <Logo size="sm" />
                <button
                  type="button"
                  onClick={() => setNavOpen(false)}
                  aria-label="Close navigation"
                  className="rounded-field p-2 text-ink-500 hover:bg-ink-50"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
              <Sidebar
                pendingApprovals={summary?.pending_approvals ?? 0}
                unreadNotifications={unreadCount}
              />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <Navbar
            streak={summary?.streak}
            unreadCount={unreadCount}
            onOpenNav={() => setNavOpen(true)}
          />

          <main
            id="main-content"
            className={cn(
              'mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:py-8',
              // Room for the fixed bottom nav on phones.
              'pb-24 lg:pb-8'
            )}
          >
            {/* Each lazy route resolves here, so navigation never blanks the chrome. */}
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>

      <BottomNav />
      <SessionTimeout />
    </div>
  );
}

export default DashboardLayout;
