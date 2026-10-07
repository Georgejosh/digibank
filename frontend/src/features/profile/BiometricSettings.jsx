import { useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Fingerprint,
  Info,
  Laptop,
  ScanFace,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/context/ToastContext';
import {
  useBiometricApproval,
  useBiometricDevices,
  useBiometricSupport,
  useEnrolBiometric,
  useRemoveBiometric,
  useWithdrawalProtection,
} from '@/hooks/useBiometrics';
import { formatDate, timeAgo } from '@/utils/date';
import { cn } from '@/utils/cn';

/** A sensible default name from the browser, e.g. "Windows PC". */
function guessDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android phone';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'This device';
}

function sensorName() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'Face ID or Touch ID';
  if (/Macintosh/.test(ua)) return 'Touch ID';
  if (/Windows/.test(ua)) return 'Windows Hello (face, fingerprint or PIN)';
  if (/Android/.test(ua)) return 'your fingerprint or face unlock';
  return 'your device’s face or fingerprint sensor';
}

/**
 * Biometric sign-in and withdrawal protection.
 *
 * Everything here is WebAuthn: the operating system runs the face or
 * fingerprint check and DigiBank only ever receives a signed answer.
 */
export function BiometricSettings() {
  const toast = useToast();
  const support = useBiometricSupport();
  const { data, isPending } = useBiometricDevices();
  const enrol = useEnrolBiometric();
  const remove = useRemoveBiometric();
  const protection = useWithdrawalProtection();
  const { approve, isScanning } = useBiometricApproval();

  const [naming, setNaming] = useState(false);
  const [deviceName, setDeviceName] = useState(guessDeviceName);

  const devices = data?.devices ?? [];
  const protectedOn = Boolean(data?.require_biometric_for_withdrawals);
  const canEnrol = support.supported && support.platform;

  const startEnrol = async () => {
    try {
      await enrol.mutateAsync(deviceName.trim() || guessDeviceName());
      setNaming(false);
    } catch {
      // toast shown by the hook
    }
  };

  const testScan = async () => {
    try {
      await approve({ force: true });
      toast.success('Scan verified', 'Your face or fingerprint was confirmed by DigiBank.');
    } catch (error) {
      toast.error('Scan failed', error.message);
    }
  };

  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-heading text-ink-900">
              <ScanFace aria-hidden="true" className="h-5 w-5 text-brand-700" />
              Face & fingerprint
            </h2>
            <p className="mt-1 max-w-lg text-sm text-ink-500">
              Sign in and approve withdrawals with {support.checked ? sensorName() : 'your device’s biometrics'}.
            </p>
          </div>
          {devices.length > 0 && (
            <Badge tone="success" icon={CheckCircle2}>
              {devices.length} device{devices.length === 1 ? '' : 's'}
            </Badge>
          )}
        </div>

        {/* Capability notice */}
        {support.checked && !canEnrol && (
          <div className="mt-4 flex items-start gap-2.5 rounded-field bg-accent-50 p-3 text-xs text-accent-900">
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
            <p>
              {!support.supported
                ? 'This browser does not support biometric sign-in. Try the latest Chrome, Edge, Safari or Firefox.'
                : 'No built-in face or fingerprint sensor was found. On Windows, turn on Windows Hello in Settings › Accounts › Sign-in options, then reload this page.'}
            </p>
          </div>
        )}

        {/* Devices */}
        <div className="mt-5">
          {isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : devices.length ? (
            <ul className="space-y-2">
              {devices.map((d) => {
                const Icon = /phone|iphone|android|ipad/i.test(d.device_name) ? Smartphone : Laptop;
                return (
                  <li key={d.id} className="flex items-center gap-3 rounded-field border border-ink-200 p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink-900">
                        {d.device_name}
                        {d.backed_up && (
                          <span title="Synced passkey - works on your other signed-in devices too" className="text-ink-400">
                            <Cloud aria-hidden="true" className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-ink-500">
                        Added {formatDate(d.created_at)}
                        {d.last_used_at ? ` · last used ${timeAgo(d.last_used_at)}` : ' · not used yet'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove.mutate(d.id)}
                      disabled={remove.isPending}
                      aria-label={`Remove ${d.device_name}`}
                      className="rounded-field p-2 text-ink-400 transition-colors hover:bg-danger-50 hover:text-danger-600 disabled:opacity-50"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center rounded-field border-2 border-dashed border-ink-200 px-4 py-6 text-center">
              <span className="flex gap-2 text-brand-600" aria-hidden="true">
                <ScanFace className="h-8 w-8" />
                <Fingerprint className="h-8 w-8" />
              </span>
              <p className="mt-2 text-sm font-semibold text-ink-900">No devices set up yet</p>
              <p className="mt-1 max-w-sm text-xs text-ink-500">
                Set up this device once and you can skip the password and code at sign-in.
              </p>
            </div>
          )}
        </div>

        {/* Enrol */}
        {canEnrol &&
          (naming ? (
            <div className="mt-4 flex flex-col gap-2 rounded-field bg-ink-50 p-3 sm:flex-row sm:items-end">
              <Input
                label="Name this device"
                value={deviceName}
                maxLength={80}
                onChange={(e) => setDeviceName(e.target.value)}
                containerClassName="flex-1"
              />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setNaming(false)} disabled={enrol.isPending}>
                  Cancel
                </Button>
                <Button onClick={startEnrol} isLoading={enrol.isPending} leftIcon={Fingerprint}>
                  {enrol.isPending ? 'Scan now...' : 'Scan to set up'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => setNaming(true)} leftIcon={Fingerprint}>
                {devices.length ? 'Add this device' : 'Set up face or fingerprint'}
              </Button>
              {devices.length > 0 && (
                <Button variant="secondary" onClick={testScan} isLoading={isScanning} leftIcon={ScanFace}>
                  Test a scan
                </Button>
              )}
            </div>
          ))}

        {/* Withdrawal protection */}
        <div
          className={cn(
            'mt-5 flex items-center gap-4 rounded-field border p-4',
            protectedOn ? 'border-success-100 bg-success-50/50' : 'border-ink-200'
          )}
        >
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              protectedOn ? 'bg-success-100 text-success-700' : 'bg-ink-100 text-ink-600'
            )}
          >
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">Require a scan for every withdrawal</p>
            <p className="text-xs text-ink-500">
              Releasing savings to your wallet and sending money to your bank both need your face or fingerprint. Checked by the server, not just this screen.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={protectedOn}
            aria-label="Require a biometric scan for withdrawals"
            disabled={!devices.length || protection.isPending}
            onClick={() => protection.mutate(!protectedOn)}
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              protectedOn ? 'bg-success-600' : 'bg-ink-300'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                protectedOn ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
              )}
            />
          </button>
        </div>

        <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-400">
          <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Your face and fingerprint never leave your device. DigiBank stores only a public key and
          checks a cryptographic signature that your device creates after a successful scan.
        </p>
      </CardBody>
    </Card>
  );
}

export default BiometricSettings;
