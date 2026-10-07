import { Link } from 'react-router-dom';
import { PiggyBank, Plus } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGoalCard } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { GoalCard } from './GoalCard';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { formatPaise } from '@/utils/money';

/** GET /api/savings/individual/ - the user's personal goals. */
export function SavingsGoals() {
  const { data: goals, isPending, isError, error, refetch } = useSavingsGoals();

  const totalSaved = goals?.reduce((sum, g) => sum + g.balance_paise, 0) ?? 0;
  const totalTarget = goals?.reduce((sum, g) => sum + g.target_amount_paise, 0) ?? 0;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Your savings goals"
        description="Money you set aside on your own. Each goal stays locked until it hits its target or its date."
        action={
          <Link
            to="/app/savings/new"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-field bg-brand-700 px-5 text-sm font-semibold text-white shadow-field transition-colors hover:bg-brand-800"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            New goal
          </Link>
        }
      />

      {isError && (
        <Card className="mb-6 border-danger-100 bg-danger-50">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-danger-700">{error?.message ?? 'Could not load your goals.'}</p>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Roll-up across every goal */}
      {!isPending && goals?.length > 0 && (
        <Card className="mb-6 border-brand-200 bg-brand-50/60">
          <CardBody className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-label text-brand-800">Saved across {goals.length} goals</p>
              <p className="text-money mt-1 text-brand-900">{formatPaise(totalSaved)}</p>
            </div>
            <p className="text-sm text-brand-800">
              of {formatPaise(totalTarget, { showDecimals: false })} targeted
            </p>
          </CardBody>
        </Card>
      )}

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonGoalCard />
          <SkeletonGoalCard />
          <SkeletonGoalCard />
          <SkeletonGoalCard />
        </div>
      ) : goals?.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={PiggyBank}
            title="No goals yet"
            description="Name the thing you're saving for, pick an amount and a date, and DigiBank will hold the line for you."
            action={
              <Link
                to="/app/savings/new"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-field bg-brand-700 px-5 text-sm font-semibold text-white shadow-field transition-colors hover:bg-brand-800"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                Create your first goal
              </Link>
            }
          />
        </Card>
      )}
    </div>
  );
}

export default SavingsGoals;
