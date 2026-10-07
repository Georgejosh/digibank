/**
 * Every React Query cache key in one place.
 *
 * Keys are the cache's primary key: if a mutation invalidates
 * ['savings', 'list'] but the query registered ['savingsGoals'], the screen
 * silently shows stale balances. Defining them here makes that impossible.
 */
export const queryKeys = {
  dashboard: ['dashboard', 'summary'],
  savings: {
    all: ['savings'],
    list: ['savings', 'list'],
    detail: (id) => ['savings', 'detail', id],
  },
  clubs: {
    all: ['clubs'],
    list: ['clubs', 'list'],
    detail: (id) => ['clubs', 'detail', id],
  },
  transactions: {
    all: ['transactions'],
    list: (filters) => ['transactions', 'list', filters],
  },
  notifications: {
    all: ['notifications'],
    list: ['notifications', 'list'],
  },
  deposits: {
    targets: ['deposits', 'targets'],
    withdrawalTargets: ['deposits', 'withdrawal-targets'],
    bankAccounts: ['deposits', 'bank-accounts'],
  },
  kyc: ['kyc'],
  paymentsConfig: ['payments', 'config'],
  biometric: {
    devices: ['biometric', 'devices'],
  },
  wallet: {
    all: ['wallet'],
    transactions: ['wallet', 'transactions'],
  },
  emergency: {
    all: ['emergency'],
    list: ['emergency', 'list'],
  },
};
