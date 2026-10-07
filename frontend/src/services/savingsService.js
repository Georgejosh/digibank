import api, { USE_MOCK_API } from './api';
import { ENDPOINTS } from './endpoints';
import mockApi from './mockApi';

/** GET /api/savings/individual/ -> savings_accounts rows, owner_type INDIVIDUAL */
export async function listSavingsGoals() {
  if (USE_MOCK_API) return mockApi.listSavingsGoals();
  const { data } = await api.get(ENDPOINTS.savings.individual);
  return data;
}

/** POST /api/savings/individual/ - amounts must already be in paise. */
export async function createSavingsGoal(payload) {
  if (USE_MOCK_API) return mockApi.createSavingsGoal(payload);
  const { data } = await api.post(ENDPOINTS.savings.individual, payload);
  return data;
}
