import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './navItems';
import { cn } from '@/utils/cn';

/**
 * Mobile navigation. Mobile-first is the rule for this app: it is a daily-use
 * savings tool that lives on a phone, so the thumb-reachable bar is the
 * primary navigation and the desktop sidebar is the adaptation.
 *
 * Only `primary` items appear here - five is the most a thumb bar can carry
 * before the targets get too small.
 */
export function BottomNav() {
  const items = NAV_ITEMS.filter((item) => item.primary);

  return (
    <nav
      aria-label="Main"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur',
        'pb-[env(safe-area-inset-bottom)] lg:hidden'
      )}
    >
      <ul className="grid grid-cols-5">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium',
                  'transition-colors duration-150',
                  isActive ? 'text-brand-700' : 'text-ink-500'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                      isActive && 'bg-brand-50'
                    )}
                  >
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default BottomNav;
