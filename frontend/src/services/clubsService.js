import api, { USE_MOCK_API } from './api';
import { ENDPOINTS } from './endpoints';
import mockApi from './mockApi';

/** GET /api/clubs/ -> groups joined with their group savings_account. */
export async function listClubs() {
  if (USE_MOCK_API) return mockApi.listClubs();
  const { data } = await api.get(ENDPOINTS.clubs.list);
  return data;
}

/** POST /api/clubs/ - Django creates the group, the creator's group_members
 *  row and the GROUP savings_account in one transaction. */
export async function createClub(payload) {
  if (USE_MOCK_API) return mockApi.createClub(payload);
  const { data } = await api.post(ENDPOINTS.clubs.list, payload);
  return data;
}
