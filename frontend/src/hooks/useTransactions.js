import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listTransactions } from '@/services/transactionsService';
import { useAuth } from './useAuth';
import { queryKeys } from './queryKeys';

/**
 * GET /api/transactions/ with filters.
 *
 * `keepPreviousData` keeps the current rows on screen while a new filter loads,
 * so changing a dropdown does not flash the list back to skeletons.
 */
export function useTransactions(filters = {}) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.transactions.list(filters),
    queryFn: () => listTransactions(filters),
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}
