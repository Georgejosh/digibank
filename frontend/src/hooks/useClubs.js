import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelInvitation,
  createClub,
  getClub,
  inviteToClub,
  joinClub,
  listClubs,
  listInvitations,
  newClubCode,
  respondInvitation,
  setClubSplit,
} from '@/services/clubsService';
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

/** GET /api/clubs/{id}/ */
export function useClub(id) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.clubs.detail(String(id)),
    queryFn: () => getClub(id),
    enabled: isAuthenticated && Boolean(id),
    staleTime: 15_000,
    retry: (count, error) => error?.status !== 404 && count < 2,
  });
}

/** GET /api/clubs/invitations/ */
export function useClubInvitations() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.clubs.invitations,
    queryFn: listInvitations,
    enabled: isAuthenticated,
    staleTime: 15_000,
  });
}

/** Anything that changes membership refreshes every club view at once. */
function useRefreshClubs() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.clubs.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    queryClient.invalidateQueries({ queryKey: queryKeys.deposits.targets });
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  };
}

/** POST /api/clubs/ */
export function useCreateClub() {
  const refresh = useRefreshClubs();
  const toast = useToast();

  return useMutation({
    mutationFn: createClub,
    onSuccess: (club) => {
      refresh();
      const invited = club.invited?.length ?? 0;
      toast.success(
        'Club created',
        invited > 0
          ? `${club.name} is live. ${invited} invite${invited > 1 ? 's' : ''} sent.`
          : `${club.name} is live. Share the club code or invite members.`
      );
    },
    onError: (error) => {
      toast.error('Could not create the club', error.message);
    },
  });
}

const INVITE_RESULT_TEXT = {
  invited: 'invited',
  already_pending: 'already has a pending invite',
  already_member: 'is already a member',
};

/** POST /api/clubs/{id}/invite/ */
export function useInviteToClub() {
  const refresh = useRefreshClubs();
  const toast = useToast();

  return useMutation({
    mutationFn: inviteToClub,
    onSuccess: ({ results }) => {
      refresh();
      const sent = results.filter((r) => r.result === 'invited').length;
      const skipped = results.filter((r) => r.result !== 'invited');
      toast.success(
        sent ? `${sent} invite${sent === 1 ? '' : 's'} sent` : 'No new invites sent',
        skipped.map((r) => `${r.email} ${INVITE_RESULT_TEXT[r.result]}`).join(' · ') || undefined
      );
    },
    onError: (error) => toast.error('Could not send invites', error.message),
  });
}

/** POST /api/clubs/{id}/split/ */
export function useClubSplit() {
  const refresh = useRefreshClubs();
  const toast = useToast();

  return useMutation({
    mutationFn: setClubSplit,
    onSuccess: ({ split_equally: on }) => {
      refresh();
      toast.success(
        on ? 'Equal split turned on' : 'Equal split turned off',
        on ? 'Every member can now see their share.' : undefined
      );
    },
    onError: (error) => toast.error('Could not change the split', error.message),
  });
}

/** POST /api/clubs/{id}/code/ */
export function useNewClubCode() {
  const refresh = useRefreshClubs();
  const toast = useToast();

  return useMutation({
    mutationFn: newClubCode,
    onSuccess: ({ join_code: code }) => {
      refresh();
      toast.success('New club code', `The old code no longer works. New code: ${code}`);
    },
    onError: (error) => toast.error('Could not change the code', error.message),
  });
}

/** POST /api/clubs/join/ */
export function useJoinClub() {
  const refresh = useRefreshClubs();
  const toast = useToast();

  return useMutation({
    mutationFn: joinClub,
    onSuccess: (res) => {
      refresh();
      if (res.result === 'joined') {
        toast.success(`You joined ${res.club_name}`, 'You had already been invited, so you are in.');
      } else if (res.result === 'already_requested') {
        toast.success('Request already sent', `Waiting for the creator of ${res.club_name} to accept.`);
      } else {
        toast.success('Request sent', `The creator of ${res.club_name} will accept or decline it.`);
      }
    },
    onError: (error) => toast.error('Could not join', error.message),
  });
}

/** POST /api/clubs/invitations/{id}/respond/ */
export function useRespondInvitation() {
  const refresh = useRefreshClubs();
  const toast = useToast();

  return useMutation({
    mutationFn: respondInvitation,
    onSuccess: (_res, { action }) => {
      refresh();
      toast.success(action === 'accept' ? 'Accepted' : 'Declined');
    },
    onError: (error) => toast.error('Could not update the request', error.message),
  });
}

/** POST /api/clubs/invitations/{id}/cancel/ */
export function useCancelInvitation() {
  const refresh = useRefreshClubs();
  const toast = useToast();

  return useMutation({
    mutationFn: cancelInvitation,
    onSuccess: () => {
      refresh();
      toast.success('Cancelled');
    },
    onError: (error) => toast.error('Could not cancel', error.message),
  });
}
