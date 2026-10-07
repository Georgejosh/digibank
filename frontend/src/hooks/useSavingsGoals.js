import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSavingsGoal, listSavingsGoals } from '@/services/savingsService';
import { useToast } from '@/context/ToastContext';
import { useAuth } from './useAuth';
import { queryKeys } from './queryKeys';

/** GET /api/savings/individual/ */
export function useSavingsGoals() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.savings.list,
    queryFn: listSavingsGoals,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

/** POST /api/savings/individual/ - `target_amount_paise`, never rupees. */
export function useCreateSavingsGoal() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: createSavingsGoal,
    onSuccess: (goal) => {
      // The new goal changes both the goal list and the dashboard totals.
      queryClient.invalidateQueries({ queryKey: queryKeys.savings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.deposits.targets });
      toast.success('Goal created', `${goal.goal_name} is ready for your first deposit.`);
    },
    onError: (error) => {
      toast.error('Could not create the goal', error.message);
    },
  });
}
