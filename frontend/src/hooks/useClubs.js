import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClub, listClubs } from '@/services/clubsService';
import { useToast } from '@/context/ToastContext';
import { useAuth } from './useAuth';
import { queryKeys } from './queryKeys';

/** GET /api/clubs/ - groups the user belongs to, with pooled progress. */
export function useClubs() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.clubs.list,
    queryFn: listClubs,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

/** POST /api/clubs/ */
export function useCreateClub() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: createClub,
    onSuccess: (club) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clubs.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.deposits.targets });
      const invited = club.invited?.length ?? 0;
      toast.success(
        'Club created',
        invited > 0
          ? `${club.name} is live. ${invited} invite${invited > 1 ? 's' : ''} queued.`
          : `${club.name} is live. Invite members to start pooling.`
      );
    },
    onError: (error) => {
      toast.error('Could not create the club', error.message);
    },
  });
}
