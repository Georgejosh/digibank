import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CircleHelp, LogOut, Menu, ShieldCheck, UserRound } from 'lucide-react';
import { PrivacyToggle } from '@/components/money/Amount';
import { Avatar } from '@/components/ui/Avatar';
import { StreakBadge } from '@/components/ui/StreakBadge';
import { Logo } from './Logo';
import { useAuth } from '@/hooks/useAuth';

/**
 * Top bar: who you are, your streak, and the way out.
 *
 * The streak sits here rather than in the page body - motivational, but never
 * competing with the balance for attention.
 */
export function Navbar({ streak, unreadCount = 0, onOpenNav }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close the account menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event) => event.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/90 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="-ml-1 rounded-field p-2 text-ink-600 transition-colors hover:bg-ink-50 lg:hidden"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>

        <Link to="/app/dashboard" className="lg:hidden" aria-label="DigiBank home">
          <Logo size="sm" showWordmark={false} />
        </Link>

        <div className="hidden min-w-0 flex-1 lg:block">
          <p className="truncate text-sm text-ink-500">
            Welcome back, <span className="font-semibold text-ink-900">{user?.name ?? 'there'}</span>
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <StreakBadge streak={streak} size="sm" />

          <PrivacyToggle className="h-9 w-9" />

          <Link
            to="/app/notifications"
            aria-label={
              unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
            }
            className="relative rounded-field p-2 text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            <Bell aria-hidden="true" className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account menu"
              className="flex items-center gap-2 rounded-full p-0.5 transition-shadow hover:ring-2 hover:ring-ink-200"
            >
              <Avatar name={user?.name ?? 'DigiBank User'} size="sm" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-40 mt-2 w-60 animate-slide-up rounded-card border border-ink-200 bg-white p-1.5 shadow-card-hover"
              >
                <div className="border-b border-ink-100 px-3 py-2.5">
                  <p className="truncate text-sm font-semibold text-ink-900">{user?.name}</p>
                  <p className="truncate text-xs text-ink-500">{user?.email}</p>
                  {user?.kyc_status === 'VERIFIED' && (
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-success-700">
                      <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                      KYC verified
                    </span>
                  )}
                </div>
                <Link
                  to="/app/profile"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="mt-1 flex w-full items-center gap-2.5 rounded-field px-3 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
                >
                  <UserRound aria-hidden="true" className="h-4 w-4 text-ink-400" />
                  Profile &amp; security
                </Link>
                <Link
                  to="/app/help"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2.5 rounded-field px-3 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
                >
                  <CircleHelp aria-hidden="true" className="h-4 w-4 text-ink-400" />
                  Help &amp; support
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="mt-1 flex border-t border-ink-100 w-full items-center gap-2.5 rounded-field px-3 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
                >
                  <LogOut aria-hidden="true" className="h-4 w-4 text-ink-400" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
