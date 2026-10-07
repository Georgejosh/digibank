import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Clock, ShieldAlert, X } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { MoneyInput, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGoalCard } from '@/components/ui/Skeleton';
import { Avatar } from '@/components/ui/Avatar';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmergencyInfoCard } from '@/features/clubs/EmergencyInfoCard';
import {
  useCreateEmergencyRequest,
  useDecideEmergencyRequest,
  useEmergencyRequests,
} from '@/hooks/useEmergency';
import { useClubs } from '@/hooks/useClubs';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { useAuth } from '@/hooks/useAuth';
import { emergencyRequestSchema } from '@/utils/validation';
import { formatPaise, rupeesToPaise } from '@/utils/money';
import { timeAgo, timeUntil } from '@/utils/date';

const STATUS_TONES = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
  COMPLETED: 'success',
};

/**
 * One emergency request, with the approval roll-call.
 *
 * The roll-call is the whole point: showing WHO has and has not decided is
 * what makes "everyone must approve" feel real rather than bureaucratic.
 */
function RequestCard({ request, currentUserId, onDecide, isDeciding }) {
  const approved = request.approvals.filter((a) => a.decision === 'APPROVE').length;
  const total = request.approvals.length;
  // String-compared: ids cross the wire as Django integer PKs, but a serializer
  // change to a string pk would silently break the "(you)" marker and hide the
  // approve buttons from the one person who needs them.
  const myVote = request.approvals.find((a) => String(a.user) === String(currentUserId));
  const needsMyDecision = request.status === 'PENDING' && myVote && !myVote.decision;

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-heading text-ink-900">{request.group_name}</h3>
            <p className="mt-0.5 truncate text-sm text-ink-500">{request.savings_account_name}</p>
          </div>
          <Badge tone={STATUS_TONES[request.status] ?? 'neutral'}>{request.status}</Badge>
        </div>

        <p className="text-money mt-4 text-ink-900">{formatPaise(request.amount_paise)}</p>
        <p className="mt-1 text-sm text-ink-500">
          Requested by {request.requested_by_name} &middot; {timeAgo(request.created_at)}
        </p>

        <blockquote className="mt-4 rounded-field border-l-4 border-accent-300 bg-accent-50/60 py-3 pl-4 pr-3 text-sm leading-relaxed text-ink-700">
          {request.reason}
        </blockquote>

        {/* Approval roll-call */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <p className="text-label text-ink-600">
              Approvals: {approved} of {total}
            </p>
            {request.status === 'PENDING' && (
              <span className="flex items-center gap-1.5 text-xs text-ink-500">
                <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                expires {timeUntil(request.expires_at)}
              </span>
            )}
          </div>

          <ul className="mt-3 space-y-2">
            {request.approvals.map((approval) => (
              <li key={approval.user} className="flex items-center gap-2.5">
                <Avatar name={approval.name} size="xs" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-700">
                  {approval.name}
                  {String(approval.user) === String(currentUserId) && (
                    <span className="text-ink-400"> (you)</span>
                  )}
                </span>
                {approval.decision === 'APPROVE' && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-success-700">
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
                    Approved
                  </span>
                )}
                {approval.decision === 'REJECT' && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-danger-600">
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                    Rejected
                  </span>
                )}
                {!approval.decision && (
                  <span className="text-xs font-medium text-ink-400">Waiting</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {needsMyDecision && (
          <div className="mt-5 flex flex-col gap-2 border-t border-ink-100 pt-4 sm:flex-row">
            <Button
              variant="primary"
              leftIcon={Check}
              fullWidth
              isLoading={isDeciding}
              onClick={() => onDecide(request.id, 'APPROVE')}
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              leftIcon={X}
              fullWidth
              disabled={isDeciding}
              onClick={() => onDecide(request.id, 'REJECT')}
            >
              Reject
            </Button>
          </div>
        )}

        {request.status === 'PENDING' && !needsMyDecision && myVote?.decision && (
          <p className="mt-4 border-t border-ink-100 pt-4 text-sm text-ink-500">
            You already {myVote.decision === 'APPROVE' ? 'approved' : 'rejected'} this. Waiting on
            the rest of the club.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Emergency withdrawal: request + approval.
 *
 * PHASE 1 SCOPE. What is deliberately NOT here:
 *  - the consensus decision itself (Django counts the votes, not the browser)
 *  - the OTP step-up before an approval is accepted
 *  - the biometric device signature
 * Approving here only records this user's vote against the mock.
 */
export function Emergency() {
  const { user } = useAuth();
  const [formOpen, setFormOpen] = useState(false);

  const { data: requests, isPending } = useEmergencyRequests();
  const { data: clubs } = useClubs();
  const { data: savingsGoals } = useSavingsGoals();
  const createRequest = useCreateEmergencyRequest();
  const decideRequest = useDecideEmergencyRequest();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(emergencyRequestSchema),
    mode: 'onTouched',
    defaultValues: { savings_account_id: '', amount_rupees: undefined, reason: '' },
  });

  const lockedClubs = clubs?.filter((c) => c.account_status === 'ACTIVE').map(c => ({
    id: c.savings_account_id,
    name: `${c.name}: ${c.goal_name}`,
    balance_paise: c.balance_paise
  })) ?? [];
  
  const lockedIndividual = savingsGoals?.filter((s) => s.status === 'ACTIVE').map(s => ({
    id: s.id,
    name: `Individual: ${s.goal_name}`,
    balance_paise: s.balance_paise
  })) ?? [];

  const lockedGoals = [...lockedClubs, ...lockedIndividual];

  const onSubmit = async (values) => {
    try {
      await createRequest.mutateAsync({
        savings_account_id: values.savings_account_id,
        amount_paise: rupeesToPaise(values.amount_rupees),
        reason: values.reason,
      });
      reset();
      setFormOpen(false);
    } catch {
      // Surfaced by the toast in useCreateEmergencyRequest.
    }
  };

  const handleDecide = (requestId, decision) => {
    // TODO(phase 2): open the OtpVerification component here with
    // purpose="EMERGENCY_APPROVAL" and only send the vote once it passes.
    decideRequest.mutate({ requestId, decision });
  };

  const pendingForMe =
    requests?.filter(
      (r) => r.status === 'PENDING' && r.approvals.some((a) => String(a.user) === String(user?.id) && !a.decision)
    ) ?? [];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Emergency withdrawal"
        description="Withdraw locked funds early. Individual goals approve instantly, while club goals require every member's agreement."
        action={
          <Button leftIcon={ShieldAlert} onClick={() => setFormOpen(true)} disabled={!lockedGoals.length}>
            Request withdrawal
          </Button>
        }
      />

      {pendingForMe.length > 0 && (
        <div className="mb-6 rounded-card border border-accent-200 bg-accent-50 p-4">
          <p className="text-sm font-semibold text-accent-900">
            {pendingForMe.length} request{pendingForMe.length === 1 ? '' : 's'} waiting on your
            decision
          </p>
          <p className="mt-0.5 text-xs text-accent-800">
            Nothing moves until every member has decided.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          {isPending ? (
            <>
              <SkeletonGoalCard />
              <SkeletonGoalCard />
            </>
          ) : requests?.length ? (
            requests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                currentUserId={user?.id}
                onDecide={handleDecide}
                isDeciding={decideRequest.isPending}
              />
            ))
          ) : (
            <Card>
              <EmptyState
                icon={ShieldAlert}
                title="No emergency requests"
                description="Good news - nobody in your clubs has needed to pull money out early."
              />
            </Card>
          )}
        </div>

        <aside>
          <EmergencyInfoCard />
        </aside>
      </div>

      {/* Request form */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Request an emergency withdrawal"
        description="For a club, every member reads this and has to approve it. For an individual goal, it will be automatically approved."
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <Select
            label="Which goal?"
            required
            error={errors.savings_account_id?.message}
            {...register('savings_account_id')}
          >
            <option value="">Choose a goal</option>
            {lockedGoals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.name} ({formatPaise(goal.balance_paise, { showDecimals: false })}{' '}
                available)
              </option>
            ))}
          </Select>

          <MoneyInput
            label="Amount needed"
            placeholder="15000"
            required
            error={errors.amount_rupees?.message}
            {...register('amount_rupees', { valueAsNumber: true })}
          />

          <Textarea
            label="Why do you need it?"
            placeholder="Be specific - this is what your club members are voting on."
            rows={4}
            required
            error={errors.reason?.message}
            {...register('reason')}
          />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={createRequest.isPending}>
              {createRequest.isPending ? 'Sending...' : 'Send to club'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default Emergency;
