import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notificationsService';
import { useAuth } from './useAuth';
import { queryKeys } from './queryKeys';

/** GET /api/notifications/ */
export function useNotifications() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.notifications.list,
    queryFn: listNotifications,
    enabled: isAuthenticated,
    staleTime: 20_000,
    // TODO(phase 2): replace polling with a websocket / push subscription.
    refetchInterval: 60_000,
  });
}

/** Unread badge count, derived from the same cache - no extra request. */
export function useUnreadNotificationCount() {
  const { data } = useNotifications();
  return data?.filter((n) => !n.is_read).length ?? 0;
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markNotificationRead,
    // Optimistic: marking as read must feel instant, and the worst case if the
    // request fails is a dot that comes back on the next refetch.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.list });
      const previous = queryClient.getQueryData(queryKeys.notifications.list);
      queryClient.setQueryData(queryKeys.notifications.list, (old) =>
        old?.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      queryClient.setQueryData(queryKeys.notifications.list, context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
