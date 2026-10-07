import { NavLink } from 'react-router-dom';
import { NAV_ITEMS, NAV_SECTIONS } from './navItems';
import { cn } from '@/utils/cn';

export function Sidebar({ pendingApprovals = 0, unreadNotifications = 0 }) {
  const badgeFor = (to) => {
    if (to === '/app/emergency' && pendingApprovals > 0) return pendingApprovals;
    if (to === '/app/notifications' && unreadNotifications > 0) return unreadNotifications;
    return null;
  };

  return (
    <nav aria-label="Main" className="flex flex-col gap-5 overflow-y-auto p-3">
      {NAV_SECTIONS.map((section) => (
        <div key={section}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
            {section}
          </p>
          <div className="flex flex-col gap-0.5">
            {NAV_ITEMS.filter((item) => item.section === section).map(({ to, label, icon: Icon }) => {
              const badge = badgeFor(to);
              return (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-3 rounded-field px-3 py-2 text-sm font-medium',
                      'transition-colors duration-150',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                      isActive
                        ? 'bg-brand-50 text-brand-800 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-600'
                        : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        aria-hidden="true"
                        className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-brand-700' : 'text-ink-400')}
                      />
                      <span className="flex-1">{label}</span>
                      {badge != null && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-600 px-1.5 text-[11px] font-bold text-white">
                          {badge > 9 ? '9+' : badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default Sidebar;
