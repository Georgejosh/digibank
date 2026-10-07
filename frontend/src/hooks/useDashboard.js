import { useQuery } from '@tanstack/react-query';
import { fetchDashboardSummary } from '@/services/dashboardService';
import { useAuth } from './useAuth';
import { queryKeys } from './queryKeys';

/**
 * Dashboard summary: totals, streak and recent activity in one request.
 *
 * TODO(backend): swap for GET /api/dashboard/summary/ - already wired in
 * services/dashboardService.js, just flip VITE_USE_MOCK_API to false.
 */
export function useDashboardSummary() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: fetchDashboardSummary,
    // Never fire an authenticated request before there is a token to send.
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}
