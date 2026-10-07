import api, { USE_MOCK_API } from './api';
import { ENDPOINTS } from './endpoints';
import mockApi from './mockApi';

export async function listNotifications() {
  if (USE_MOCK_API) return mockApi.listNotifications();
  const { data } = await api.get(ENDPOINTS.notifications.list);
  return data.results ?? data;
}

export async function markNotificationRead(id) {
  if (USE_MOCK_API) return mockApi.markNotificationRead(id);
  const { data } = await api.post(ENDPOINTS.notifications.markRead(id));
  return data;
}

export async function markAllNotificationsRead() {
  if (USE_MOCK_API) return mockApi.markAllNotificationsRead();
  const { data } = await api.post(ENDPOINTS.notifications.markAllRead);
  return data;
}
