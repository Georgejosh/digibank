import api, { USE_MOCK_API } from './api';
import { ENDPOINTS } from './endpoints';
import mockApi from './mockApi';

/**
 * GET /api/dashboard/summary/
 * One aggregated call rather than four - the dashboard should paint in a
 * single round trip on a phone connection.
 */
export async function fetchDashboardSummary() {
  if (USE_MOCK_API) return mockApi.dashboardSummary();
  const { data } = await api.get(ENDPOINTS.dashboard.summary);
  return data;
}
