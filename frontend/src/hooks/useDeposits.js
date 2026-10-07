import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createDeposit,
  createWithdrawal,
  createWalletDeposit,
  createWalletWithdrawal,
  listBankAccounts,
  listDepositTargets,
  listWalletTransactions,
  listWithdrawalTargets,
} from '@/services/depositsService';
import { createTopupOrder, payWithRazorpay, verifyTopup } from '@/services/kycService';
import { useToast } from '@/context/ToastContext';
import { formatPaise } from '@/utils/money';
import { useAuth } from './useAuth';
import { queryKeys } from './queryKeys';

/** Savings accounts the user can pay into (own goals + club goals). */
export function useDepositTargets() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.deposits.targets,
    queryFn: listDepositTargets,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}

/** linked_bank_accounts rows. */
export function useBankAccounts() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.deposits.bankAccounts,
    queryFn: listBankAccounts,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
}

/** Individual savings accounts eligible for withdrawal */
export function useWithdrawalTargets() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.deposits.withdrawalTargets,
    queryFn: listWithdrawalTargets,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

/** GET /api/payments/wallet/transactions/ - the wallet statement. */
export function useWalletTransactions() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.wallet.transactions,
    queryFn: listWalletTransactions,
    enabled: isAuthenticated,
  });
}

/**
 * Every money mutation changes the wallet balance, and that balance lives on
 * the user object in AuthContext rather than in the query cache - so each one
 * must call refreshUser() as well as invalidating the cached views.
 */
function useMoneyMovedRefresher() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();

  return () => {
    refreshUser?.();
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    queryClient.invalidateQueries({ queryKey: queryKeys.savings.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.clubs.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.deposits.targets });
    queryClient.invalidateQueries({ queryKey: queryKeys.deposits.withdrawalTargets });
    queryClient.invalidateQueries({ queryKey: queryKeys.wallet.all });
  };
}

/**
 * POST /api/payments/deposits/ - wallet -> goal or club.
 *
 * Deliberately NOT optimistic: a balance is the one number that must never be
 * shown as higher than the server believes it is. We wait for the real row.
 */
export function useCreateDeposit() {
  const refresh = useMoneyMovedRefresher();
  const toast = useToast();

  return useMutation({
    mutationFn: createDeposit,
    onSuccess: (transaction) => {
      refresh();
      toast.success(
        `${formatPaise(transaction.amount_paise)} locked away`,
        `Moved from your wallet into ${transaction.savings_account_name}.`
      );
    },
    onError: (error) => {
      toast.error('Deposit failed', error.message);
    },
  });
}

/** POST /api/payments/withdrawals/ - unlocked goal -> wallet. */
export function useCreateWithdrawal() {
  const refresh = useMoneyMovedRefresher();
  const toast = useToast();

  return useMutation({
    mutationFn: createWithdrawal,
    onSuccess: (transaction) => {
      refresh();
      toast.success(
        `${formatPaise(transaction.amount_paise)} released`,
        `Moved from ${transaction.savings_account_name} into your wallet.`
      );
    },
    onError: (error) => {
      toast.error('Withdrawal restricted', error.message);
    },
  });
}

/** POST /api/payments/wallet/deposit/ - linked bank -> wallet. */
export function useCreateWalletDeposit() {
  const refresh = useMoneyMovedRefresher();
  const toast = useToast();

  return useMutation({
    mutationFn: createWalletDeposit,
    onSuccess: (data) => {
      refresh();
      toast.success(
        `${formatPaise(data?.transaction?.amount_paise)} added`,
        'Your wallet has been topped up.'
      );
    },
    onError: (error) => {
      toast.error('Top-up failed', error.message);
    },
  });
}

/** POST /api/payments/wallet/withdraw/ - wallet -> linked bank. */
export function useCreateWalletWithdrawal() {
  const refresh = useMoneyMovedRefresher();
  const toast = useToast();

  return useMutation({
    mutationFn: createWalletWithdrawal,
    onSuccess: (data) => {
      refresh();
      toast.success(
        `${formatPaise(data?.transaction?.amount_paise)} sent to bank`,
        'Transferred from your wallet to your linked account.'
      );
    },
    onError: (error) => {
      toast.error('Withdrawal failed', error.message);
    },
  });
}

/**
 * Real top-up through Razorpay: server creates the order, Checkout collects
 * the payment, the server verifies the signature and credits the wallet.
 */
export function useGatewayTopup() {
  const refresh = useMoneyMovedRefresher();
  const toast = useToast();

  return useMutation({
    mutationFn: async (payload) => {
      const order = await createTopupOrder(payload);
      const payment = await payWithRazorpay(order);
      return verifyTopup(payment);
    },
    onSuccess: (data) => {
      refresh();
      toast.success(`${formatPaise(data?.transaction?.amount_paise)} added`, 'Payment received. Your wallet is topped up.');
    },
    onError: (error) => {
      if (error.cancelled) toast.info('Payment cancelled', 'No money was taken.');
      else toast.error('Top-up failed', error.message);
    },
  });
}
