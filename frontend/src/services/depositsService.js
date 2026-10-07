import api, { USE_MOCK_API } from './api';
import { ENDPOINTS } from './endpoints';
import mockApi from './mockApi';

/** linked_bank_accounts rows the user has verified. */
export async function listBankAccounts() {
  if (USE_MOCK_API) return mockApi.listBankAccounts();
  const { data } = await api.get(ENDPOINTS.deposits.bankAccounts);
  return data.results ?? data;
}

/** Every ACTIVE savings account the user may pay into (own goals + clubs). */
export async function listDepositTargets() {
  if (USE_MOCK_API) return mockApi.listDepositTargets();
  const { data } = await api.get(ENDPOINTS.savings.depositTargets);
  return data.results ?? data;
}

/**
 * POST /api/payments/deposits/
 * TODO(backend): this is where the real payment gateway handshake happens.
 * Phase 1 fakes a SUCCESS transaction immediately; the real flow will return a
 * PENDING transaction and settle it via a gateway webhook.
 */
export async function createDeposit(payload) {
  if (USE_MOCK_API) return mockApi.createDeposit(payload);
  const { data } = await api.post(ENDPOINTS.deposits.create, payload);
  return data;
}

/** Individual savings goals eligible for withdrawal */
export async function listWithdrawalTargets() {
  if (USE_MOCK_API) return mockApi.listWithdrawalTargets ? mockApi.listWithdrawalTargets() : [];
  const { data } = await api.get(ENDPOINTS.savings.withdrawalTargets);
  return data.results ?? data;
}

export async function createWithdrawal(payload) {
  if (USE_MOCK_API) return mockApi.createWithdrawal ? mockApi.createWithdrawal(payload) : null;
  const { data } = await api.post(ENDPOINTS.withdrawals.create, payload);
  return data;
}

export async function createWalletDeposit(payload) {
  if (USE_MOCK_API) return mockApi.createWalletDeposit ? mockApi.createWalletDeposit(payload) : null;
  const { data } = await api.post(ENDPOINTS.wallet.deposit, payload);
  return data;
}

export async function createWalletWithdrawal(payload) {
  if (USE_MOCK_API) return mockApi.createWalletWithdrawal ? mockApi.createWalletWithdrawal(payload) : null;
  const { data } = await api.post(ENDPOINTS.wallet.withdraw, payload);
  return data;
}

/** The wallet statement: every top-up, bank withdrawal and savings move. */
export async function listWalletTransactions() {
  if (USE_MOCK_API) return mockApi.listWalletTransactions ? mockApi.listWalletTransactions() : [];
  const { data } = await api.get(ENDPOINTS.wallet.transactions);
  return data.results ?? data;
}
