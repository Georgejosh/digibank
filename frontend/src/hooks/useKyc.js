import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addBankAccount,
  getKyc,
  getPaymentsConfig,
  makePrimaryBankAccount,
  removeBankAccount,
  submitKyc,
} from '@/services/kycService';
import { useToast } from '@/context/ToastContext';
import { useAuth } from './useAuth';
import { queryKeys } from './queryKeys';

export function useKyc() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: queryKeys.kyc, queryFn: getKyc, enabled: isAuthenticated });
}

export function useSubmitKyc() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const toast = useToast();
  return useMutation({
    mutationFn: submitKyc,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.kyc, data);
      refreshUser?.();
      toast.success('KYC submitted', 'We will review your documents shortly.');
    },
    onError: (error) => toast.error('KYC not submitted', error.message),
  });
}

export function usePaymentsConfig() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.paymentsConfig,
    queryFn: getPaymentsConfig,
    enabled: isAuthenticated,
    staleTime: 10 * 60_000,
  });
}

function useBanksChanged() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.deposits.bankAccounts });
}

export function useAddBankAccount() {
  const changed = useBanksChanged();
  const toast = useToast();
  return useMutation({
    mutationFn: addBankAccount,
    onSuccess: (acc) => {
      changed();
      toast.success('Bank account linked', `${acc.bank_name} ${acc.masked_number} is ready to use.`);
    },
  });
}

export function useRemoveBankAccount() {
  const changed = useBanksChanged();
  const toast = useToast();
  return useMutation({
    mutationFn: removeBankAccount,
    onSuccess: () => {
      changed();
      toast.success('Bank account removed');
    },
    onError: (error) => toast.error('Could not remove account', error.message),
  });
}

export function useMakePrimaryBankAccount() {
  const changed = useBanksChanged();
  return useMutation({ mutationFn: makePrimaryBankAccount, onSuccess: changed });
}
