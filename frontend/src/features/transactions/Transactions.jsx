import { useState } from 'react';
import { Download, Receipt, Search, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { TransactionRow } from './TransactionRow';
import { useTransactions } from '@/hooks/useTransactions';
import { useDepositTargets } from '@/hooks/useDeposits';
import { formatPaise } from '@/utils/money';
import { csvDateTime, downloadCsv, paiseToCsv } from '@/utils/csv';

const INITIAL_FILTERS = { type: 'ALL', status: 'ALL', accountId: 'ALL', search: '' };

/**
 * The ledger.
 *
 * Filters live in component state and go straight into the query key, so each
 * combination is cached separately and going back to a previous filter is
 * instant. `keepPreviousData` in the hook stops the list flashing to skeletons
 * while a new filter loads.
 */
export function Transactions() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);

  const { data: transactions, isPending, isFetching } = useTransactions(filters);
  const { data: targets } = useDepositTargets();

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(INITIAL_FILTERS);

  const deposited =
    transactions
      ?.filter((t) => t.type === 'DEPOSIT' && t.status === 'SUCCESS')
      .reduce((sum, t) => sum + t.amount_paise, 0) ?? 0;
  const withdrawn =
    transactions
      ?.filter((t) => t.type === 'WITHDRAWAL' && t.status === 'SUCCESS')
      .reduce((sum, t) => sum + t.amount_paise, 0) ?? 0;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Savings statement"
        description="Every deposit and withdrawal across your goals and clubs. Wallet top-ups and bank transfers are on the Wallet page."
        action={
          <div className="flex gap-2">
            <Link
              to="/app/wallet"
              className="inline-flex h-9 items-center gap-1.5 rounded-field px-3.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
            >
              <Wallet aria-hidden="true" className="h-4 w-4" />
              Wallet statement
            </Link>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={Download}
              disabled={!transactions?.length}
              onClick={() =>
                downloadCsv(`digibank-savings-statement-${new Date().toISOString().slice(0, 10)}.csv`, [
                  ['Date', 'Reference', 'Goal / club', 'Type', 'Status', 'Amount (INR)', 'Balance after (INR)'],
                  ...transactions.map((t) => [
                    csvDateTime(t.created_at),
                    t.gateway_ref,
                    t.savings_account_name,
                    t.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal',
                    t.status,
                    paiseToCsv(t.amount_paise),
                    paiseToCsv(t.balance_after_paise),
                  ]),
                ])
              }
            >
              Download CSV
            </Button>
          </div>
        }
      />

      {/* Totals for whatever the current filter shows */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody className="py-4">
            <p className="text-label text-ink-500">Deposited</p>
            <p className="mt-1 text-money text-success-700">+{formatPaise(deposited)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <p className="text-label text-ink-500">Withdrawn</p>
            <p className="mt-1 text-money text-ink-900">-{formatPaise(withdrawn)}</p>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-5">
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label htmlFor="tx-search" className="mb-1.5 block text-label text-ink-700">
              Search
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              />
              <input
                id="tx-search"
                type="search"
                value={filters.search}
                onChange={(e) => setFilter('search', e.target.value)}
                placeholder="Goal name or reference"
                className="h-11 w-full rounded-field border border-ink-200 bg-white pl-9 pr-3.5 text-sm text-ink-900 shadow-field placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              />
            </div>
          </div>

          <Select
            label="Type"
            value={filters.type}
            onChange={(e) => setFilter('type', e.target.value)}
          >
            <option value="ALL">All types</option>
            <option value="DEPOSIT">Deposits</option>
            <option value="WITHDRAWAL">Withdrawals</option>
          </Select>

          <Select
            label="Status"
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value)}
          >
            <option value="ALL">All statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </Select>

          <div className="sm:col-span-2 lg:col-span-4">
            <Select
              label="Goal or club"
              value={filters.accountId}
              onChange={(e) => setFilter('accountId', e.target.value)}
            >
              <option value="ALL">All goals and clubs</option>
              {targets?.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.club_name ? `${target.club_name}: ` : ''}
                  {target.goal_name}
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      {/* Ledger */}
      <Card>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="text-heading text-ink-900">
            {transactions?.length ?? 0} transaction{transactions?.length === 1 ? '' : 's'}
          </h2>
          {isFetching && !isPending && (
            <span role="status" className="text-xs text-ink-400">
              Updating...
            </span>
          )}
        </div>

        {isPending ? (
          <SkeletonList rows={6} />
        ) : transactions?.length ? (
          <ul className="divide-y divide-ink-100">
            {transactions.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} showBalance />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Receipt}
            title={isFiltered ? 'No matching transactions' : 'No transactions yet'}
            description={
              isFiltered
                ? 'Try widening the filters to see more of your history.'
                : 'Your deposits and withdrawals will appear here.'
            }
            action={
              isFiltered ? (
                <button
                  type="button"
                  onClick={() => setFilters(INITIAL_FILTERS)}
                  className="inline-flex h-11 items-center justify-center rounded-field bg-white px-5 text-sm font-semibold text-ink-700 ring-1 ring-inset ring-ink-200 transition-colors hover:bg-ink-50"
                >
                  Clear filters
                </button>
              ) : null
            }
          />
        )}
      </Card>
    </div>
  );
}

export default Transactions;
