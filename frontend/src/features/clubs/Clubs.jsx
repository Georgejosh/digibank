import { Link } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGoalCard } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { ClubCard } from './ClubCard';
import { EmergencyInfoCard } from './EmergencyInfoCard';
import { useClubs } from '@/hooks/useClubs';
import { formatPaise } from '@/utils/money';

/** GET /api/clubs/ - group savings the user belongs to. */
export function Clubs() {
  const { data: clubs, isPending, isError, error, refetch } = useClubs();

  const myTotal = clubs?.reduce((sum, c) => sum + c.my_contribution_paise, 0) ?? 0;
  const pooledTotal = clubs?.reduce((sum, c) => sum + c.balance_paise, 0) ?? 0;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Your clubs"
        description="Group savings pools. Everyone pays in, everyone sees the progress, and nobody withdraws alone."
        action={
          <Link
            to="/app/clubs/new"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-field bg-brand-700 px-5 text-sm font-semibold text-white shadow-field transition-colors hover:bg-brand-800"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Create club
          </Link>
        }
      />

      {isError && (
        <Card className="mb-6 border-danger-100 bg-danger-50">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-danger-700">{error?.message ?? 'Could not load your clubs.'}</p>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          {!isPending && clubs?.length > 0 && (
            <Card className="mb-4 border-brand-200 bg-brand-50/60">
              <CardBody className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="text-label text-brand-800">Your contributions</p>
                  <p className="text-money mt-1 text-brand-900">{formatPaise(myTotal)}</p>
                </div>
                <p className="text-sm text-brand-800">
                  in a pool of {formatPaise(pooledTotal, { showDecimals: false })} across{' '}
                  {clubs.length} club{clubs.length === 1 ? '' : 's'}
                </p>
              </CardBody>
            </Card>
          )}

          {isPending ? (
            <div className="grid gap-4">
              <SkeletonGoalCard />
              <SkeletonGoalCard />
            </div>
          ) : clubs?.length ? (
            <div className="grid gap-4">
              {clubs.map((club) => (
                <ClubCard key={club.id} club={club} />
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                icon={Users}
                title="You're not in any clubs yet"
                description="Start one for a trip, a gift, or a household purchase, and invite the people saving for it with you."
                action={
                  <Link
                    to="/app/clubs/new"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-field bg-brand-700 px-5 text-sm font-semibold text-white shadow-field transition-colors hover:bg-brand-800"
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    Create your first club
                  </Link>
                }
              />
            </Card>
          )}
        </div>

        <aside>
          <EmergencyInfoCard />
        </aside>
      </div>
    </div>
  );
}

export default Clubs;
