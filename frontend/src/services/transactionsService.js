import api, { USE_MOCK_API } from './api';
import { ENDPOINTS } from './endpoints';
import mockApi from './mockApi';

/**
 * GET /api/transactions/?type=&status=&savings_account=&search=
 * Filtering happens server-side so the phone never downloads a full ledger.
 */
export async function listTransactions(filters = {}) {
  if (USE_MOCK_API) return mockApi.listTransactions(filters);
  const { data } = await api.get(ENDPOINTS.transactions.list, {
    params: {
      type: filters.type !== 'ALL' ? filters.type : undefined,
      status: filters.status !== 'ALL' ? filters.status : undefined,
      savings_account: filters.accountId !== 'ALL' ? filters.accountId : undefined,
      search: filters.search || undefined,
    },
  });
  // DRF pagination returns { results: [...] }; a plain list when unpaginated.
  return data.results ?? data;
}
