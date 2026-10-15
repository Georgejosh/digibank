import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, KeyRound, LogIn, Mail, X } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import {
  useCancelInvitation,
  useClubInvitations,
  useJoinClub,
  useRespondInvitation,
} from '@/hooks/useClubs';
import { formatPaise } from '@/utils/money';
import { formatDate, timeAgo } from '@/utils/date';

const REQUEST_STATUS = {
  PENDING: { tone: 'warning', label: 'Waiting for creator' },
  ACCEPTED: { tone: 'success', label: 'Accepted' },
  DECLINED: { tone: 'danger', label: 'Declined' },
  CANCELLED: { tone: 'neutral', label: 'Withdrawn' },
};

/** Invites waiting for this user - accept or decline from their own account. */
export function PendingInvitations() {
  const { data } = useClubInvitations();
  const respond = useRespondInvitation();
  const invites = data?.invites ?? [];
  if (invites.length === 0) return null;

  return (
    <Card className="mb-4 border-accent-200 bg-accent-50/50">
      <CardBody>
        <h2 className="flex items-center gap-2 text-heading text-ink-900">
          <Mail aria-hidden="true" className="h-5 w-5 text-accent-700" />
          You&rsquo;re invited
          <span className="rounded-full bg-accent-100 px-2 py-0.5 text-xs font-bold text-accent-800">
            {invites.length}
          </span>
        </h2>
        <ul className="mt-3 divide-y divide-accent-100">
          {invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink-900">{i.club_name}</p>
                <p className="text-sm text-ink-600">
                  {i.invited_by} invited you · saving for {i.goal_name} ·{' '}
                  {formatPaise(i.target_amount_paise, { showDecimals: false })} target
                  {i.deadline && ` by ${formatDate(i.deadline)}`} · {i.member_count} member
                  {i.member_count === 1 ? '' : 's'}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">Sent {timeAgo(i.created_at)}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ id: i.id, action: 'decline' })}
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                  Decline
                </Button>
                <Button
                  size="sm"
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ id: i.id, action: 'accept' })}
                >
                  <Check aria-hidden="true" className="h-4 w-4" />
                  Accept
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/** Type a club code to ask to join, and track the requests you've made. */
export function JoinWithCode() {
  const [code, setCode] = useState('');
  const join = useJoinClub();
  const cancel = useCancelInvitation();
  const { data } = useClubInvitations();
  const requests = data?.join_requests ?? [];
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const submit = async (event) => {
    event.preventDefault();
    if (clean.length !== 8) return;
    try {
      await join.mutateAsync(clean);
      setCode('');
    } catch {
      // toast shown by the hook
    }
  };

  const onChange = (event) => {
    const raw = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    setCode(raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw);
  };

  return (
    <Card>
      <CardBody>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <KeyRound aria-hidden="true" className="h-4 w-4 text-brand-600" />
          Join with a code
        </h2>
        <p className="mt-1 text-sm text-ink-500">Got a club code from a friend? Enter it to ask to join.</p>
        <form onSubmit={submit} noValidate className="mt-3 flex gap-2">
          <Input
            aria-label="Club code"
            placeholder="ABCD-EFGH"
            value={code}
            onChange={onChange}
            autoComplete="off"
            className="font-mono uppercase tracking-widest"
            containerClassName="flex-1"
          />
          <Button type="submit" isLoading={join.isPending} disabled={clean.length !== 8}>
            <LogIn aria-hidden="true" className="h-4 w-4" />
            Ask
          </Button>
        </form>

        {requests.length > 0 && (
          <div className="mt-4 border-t border-ink-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Your join requests</p>
            <ul className="mt-2 space-y-2.5">
              {requests.map((r) => {
                const s = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.PENDING;
                return (
                  <li key={r.id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      {r.status === 'ACCEPTED' ? (
                        <Link to={`/app/clubs/${r.club_id}`} className="truncate text-sm font-semibold text-brand-700 hover:underline">
                          {r.club_name}
                        </Link>
                      ) : (
                        <p className="truncate text-sm font-semibold text-ink-900">{r.club_name}</p>
                      )}
                      <p className="flex items-center gap-1 text-xs text-ink-500">
                        <Clock aria-hidden="true" className="h-3 w-3" />
                        {timeAgo(r.created_at)}
                        {r.status === 'PENDING' && (
                          <button
                            type="button"
                            onClick={() => cancel.mutate(r.id)}
                            disabled={cancel.isPending}
                            className="ml-1 font-semibold text-ink-600 hover:text-danger-600"
                          >
                            · Withdraw
                          </button>
                        )}
                      </p>
                    </div>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
