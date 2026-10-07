import api, { USE_MOCK_API } from './api';
import { ENDPOINTS } from './endpoints';
import mockApi from './mockApi';

export async function listEmergencyRequests() {
  if (USE_MOCK_API) return mockApi.listEmergencyRequests();
  const { data } = await api.get(ENDPOINTS.emergency.list);
  return data.results ?? data;
}

export async function createEmergencyRequest(payload) {
  if (USE_MOCK_API) return mockApi.createEmergencyRequest(payload);
  const { data } = await api.post(ENDPOINTS.emergency.create, payload);
  return data;
}

/**
 * Record this user's vote on a request.
 *
 * TODO(backend + phase 2): the real call must carry a freshly verified OTP and
 * a device signature, and Django - never the browser - decides when the
 * unanimous threshold is met and money moves.
 */
export async function decideEmergencyRequest({ requestId, decision }) {
  if (USE_MOCK_API) return mockApi.decideEmergencyRequest({ requestId, decision });
  const url =
    decision === 'APPROVE'
      ? ENDPOINTS.emergency.approve(requestId)
      : ENDPOINTS.emergency.reject(requestId);
  const { data } = await api.post(url);
  return data;
}
