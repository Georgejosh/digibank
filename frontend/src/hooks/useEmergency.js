import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createEmergencyRequest,
  decideEmergencyRequest,
  listEmergencyRequests,
} from '@/services/emergencyService';
import { useToast } from '@/context/ToastContext';
import { useAuth } from './useAuth';
import { queryKeys } from './queryKeys';

/** GET /api/emergency/requests/ */
export function useEmergencyRequests() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.emergency.list,
    queryFn: listEmergencyRequests,
    enabled: isAuthenticated,
    staleTime: 15_000,
  });
}

export function useCreateEmergencyRequest() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: createEmergencyRequest,
    onSuccess: (request) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.emergency.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      toast.success(
        'Request sent to your club',
        `All ${request.approvals.length} members must approve before any money moves.`
      );
    },
    onError: (error) => {
      toast.error('Could not send the request', error.message);
    },
  });
}

/**
 * Record this user's approve/reject vote.
 *
 * TODO(phase 2): the real flow gates this behind a fresh OTP and a device
 * signature, and Django alone decides when the unanimous threshold is met.
 */
export function useDecideEmergencyRequest() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: decideEmergencyRequest,
    onSuccess: (request, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.emergency.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      toast.success(
        variables.decision === 'APPROVE' ? 'You approved the request' : 'You rejected the request',
        variables.decision === 'APPROVE'
          ? `Waiting on ${request.approvals.filter((a) => !a.decision).length} more member(s).`
          : 'A single rejection stops the withdrawal.'
      );
    },
    onError: (error) => {
      toast.error('Could not record your decision', error.message);
    },
  });
}
