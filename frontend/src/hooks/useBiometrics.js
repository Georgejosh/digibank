import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveWithBiometrics,
  biometricSupport,
  enrolDevice,
  friendlyBiometricError,
  listDevices,
  removeDevice,
  setWithdrawalProtection,
} from '@/services/biometricService';
import { useToast } from '@/context/ToastContext';
import { useAuth } from './useAuth';
import { queryKeys } from './queryKeys';

/** { supported, platform, checked } - platform means a built-in face/fingerprint sensor. */
export function useBiometricSupport() {
  const [state, setState] = useState({ supported: false, platform: false, checked: false });
  useEffect(() => {
    let live = true;
    biometricSupport().then((s) => live && setState({ ...s, checked: true }));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

export function useBiometricDevices() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.biometric.devices,
    queryFn: listDevices,
    enabled: isAuthenticated,
  });
}

function useAfterChange() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.biometric.devices });
    refreshUser?.();
  };
}

export function useEnrolBiometric() {
  const toast = useToast();
  const after = useAfterChange();
  return useMutation({
    mutationFn: enrolDevice,
    onSuccess: (device) => {
      after();
      toast.success('Biometrics set up', `${device.device_name} can now sign you in and approve withdrawals.`);
    },
    onError: (error) => toast.error('Setup failed', friendlyBiometricError(error)),
  });
}

/**
 * Returns `approve()`: when the signed-in user has switched on "require
 * biometric for withdrawals" it runs the scan and resolves to a single-use
 * token; otherwise it resolves to undefined and the caller proceeds normally.
 * Throws (with a friendly message) if the scan fails or is cancelled.
 */
export function useBiometricApproval() {
  const { user } = useAuth();
  const required = Boolean(user?.require_biometric_for_withdrawals);
  const [isScanning, setIsScanning] = useState(false);

  const approve = useCallback(
    async ({ force = false } = {}) => {
      if (!required && !force) return undefined;
      setIsScanning(true);
      try {
        return await approveWithBiometrics();
      } catch (error) {
        throw new Error(friendlyBiometricError(error));
      } finally {
        setIsScanning(false);
      }
    },
    [required]
  );

  return { required, approve, isScanning };
}

export function useRemoveBiometric() {
  const toast = useToast();
  const after = useAfterChange();
  const { approve } = useBiometricApproval();
  return useMutation({
    mutationFn: async (id) => removeDevice(id, await approve()),
    onSuccess: () => {
      after();
      toast.success('Device removed', 'It can no longer sign in or approve withdrawals.');
    },
    onError: (error) => toast.error('Could not remove device', error.message),
  });
}

export function useWithdrawalProtection() {
  const toast = useToast();
  const after = useAfterChange();
  const { approve } = useBiometricApproval();
  return useMutation({
    // Turning protection off needs a scan; turning it on does not.
    mutationFn: async (enabled) => setWithdrawalProtection(enabled, enabled ? undefined : await approve()),
    onSuccess: (data) => {
      after();
      toast.success(
        data.require_biometric_for_withdrawals ? 'Withdrawal protection on' : 'Withdrawal protection off',
        data.require_biometric_for_withdrawals
          ? 'Every withdrawal now needs your face or fingerprint.'
          : 'Withdrawals no longer need a biometric scan.'
      );
    },
    onError: (error) => toast.error('Could not update setting', error.message),
  });
}
