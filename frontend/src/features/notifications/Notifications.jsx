import { Link } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  CalendarClock,
  CheckCheck,
  ShieldAlert,
  Target,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/hooks/useNotifications';
import { timeAgo } from '@/utils/date';
import { cn } from '@/utils/cn';

/**
 * Presentation for each NotificationType in
 * backend/apps/notifications/models.py. `to` is where tapping the row goes.
 */
const TYPES = {
  APPROVAL_NEEDED: {
    icon: ShieldAlert,
    tone: 'bg-accent-50 text-accent-700',
    to: '/app/emergency',
  },
  GOAL_REACHED: { icon: Target, tone: 'bg-success-50 text-success-600', to: '/app/savings' },
  DEPOSIT_RECEIVED: {
    icon: ArrowDownLeft,
    tone: 'bg-brand-50 text-brand-700',
    to: '/app/transactions',
  },
  WITHDRAWAL_COMPLETED: {
    icon: ArrowUpRight,
    tone: 'bg-ink-100 text-ink-600',
    to: '/app/transactions',
  },
  EMERGENCY_REJECTED: { icon: XCircle, tone: 'bg-danger-50 text-danger-600', to: '/app/emergency' },
  GROUP_INVITE: { icon: UserPlus, tone: 'bg-brand-50 text-brand-700', to: '/app/clubs' },
  DEADLINE_NEAR: { icon: CalendarClock, tone: 'bg-accent-50 text-accent-700', to: '/app/savings' },
};

const FALLBACK = { icon: Bell, tone: 'bg-ink-100 text-ink-600', to: '/app/dashboard' };

function NotificationRow({ notification, onRead }) {
  const { icon: Icon, tone, to } = TYPES[notification.type] ?? FALLBACK;

  return (
    <li>
      <Link
        to={to}
        onClick={() => !notification.is_read && onRead(notification.id)}
        className={cn(
          'flex items-start gap-3 px-5 py-4 transition-colors hover:bg-ink-50',
          !notification.is_read && 'bg-brand-50/40'
        )}
      >
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tone)}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-sm text-ink-900',
              notification.is_read ? 'font-medium' : 'font-bold'
            )}
          >
            {notification.title}
          </p>
          {notification.body && (
            <p className="mt-0.5 text-sm leading-relaxed text-ink-600">{notification.body}</p>
          )}
          <p className="mt-1 text-xs text-ink-400">{timeAgo(notification.created_at)}</p>
        </div>

        {!notification.is_read && (
          <span
            aria-label="Unread"
            className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-600"
          />
        )}
      </Link>
    </li>
  );
}

export function Notifications() {
  const { data: notifications, isPending } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unread = notifications?.filter((n) => !n.is_read).length ?? 0;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Notifications"
        description={
          unread > 0 ? `${unread} unread` : 'Approvals, goals reached and deposit confirmations.'
        }
        action={
          unread > 0 ? (
            <Button
              variant="secondary"
              leftIcon={CheckCheck}
              isLoading={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </Button>
          ) : null
        }
      />

      <Card>
        {isPending ? (
          <SkeletonList rows={5} />
        ) : notifications?.length ? (
          <ul className="divide-y divide-ink-100">
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onRead={(id) => markRead.mutate(id)}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Bell}
            title="Nothing to catch up on"
            description="We'll tell you when a deposit lands, a goal is reached, or a club needs your approval."
          />
        )}
      </Card>
    </div>
  );
}

export default Notifications;
