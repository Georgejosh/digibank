import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, CheckCircle2, Circle, Loader2, MapPin, ShieldCheck, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { aadhaarOtp, aadhaarVerify, checkPan } from '@/services/kycService';
import { aadhaarIsValid, PAN_RE } from './kycRules';
import { cn } from '@/utils/cn';

/* Real-time PAN and Aadhaar verification shown under the inputs as the user types. */

function Check({ ok, pending, label, soft }) {
  const Icon = pending ? Circle : ok ? CheckCircle2 : XCircle;
  return (
    <li className={cn('flex items-center gap-1.5', pending ? 'text-ink-400' : ok ? 'text-success-700' : soft ? 'text-accent-700' : 'text-danger-600')}>
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
    </li>
  );
}

function ResultBox({ tone, icon: Icon, title, children }) {
  const tones = {
    success: 'border-success-100 bg-success-50 text-success-700',
    danger: 'border-danger-100 bg-danger-50 text-danger-700',
    info: 'border-brand-100 bg-brand-50 text-brand-800',
  };
  return (
    <div className={cn('mt-2 flex items-start gap-2.5 rounded-field border p-3 text-xs', tones[tone])}>
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {children}
      </div>
    </div>
  );
}

/** PAN input with live format checks and, with a provider, an Income Tax record lookup. */
export function PanVerify({ pan, fullName, onChange, error, mode }) {
  const [state, setState] = useState({ status: 'idle' });
  const seq = useRef(0);

  const surname = fullName.trim().split(/\s+/).pop()?.[0]?.toUpperCase() ?? '';
  const live = [
    { label: 'Format ABCDE1234F', ok: PAN_RE.test(pan), pending: pan.length < 10 },
    { label: 'Individual PAN (4th letter P)', ok: pan[3] === 'P', pending: pan.length < 4 },
    { label: '5th letter matches surname initial', ok: !!surname && pan[4] === surname, pending: pan.length < 5, soft: true },
  ];
  const formatOk = PAN_RE.test(pan) && pan[3] === 'P';

  useEffect(() => {
    if (!formatOk || fullName.trim().length < 3) {
      setState({ status: 'idle' });
      return undefined;
    }
    const id = ++seq.current;
    setState({ status: 'checking' });
    const t = setTimeout(async () => {
      try {
        const data = await checkPan({ pan, full_name: fullName.trim() });
        if (id === seq.current) setState({ status: 'done', data });
      } catch (e) {
        if (id === seq.current) setState({ status: 'error', message: e.message });
      }
    }, 600);
    return () => clearTimeout(t);
  }, [pan, fullName, formatOk]);

  const reg = state.data?.registry;
  return (
    <div>
      <Input label="PAN number" required placeholder="ABCDE1234F" maxLength={10} value={pan} error={error}
        className="font-mono uppercase tracking-widest" autoComplete="off"
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
      {pan.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">{live.map((c) => <Check key={c.label} {...c} />)}</ul>
      )}
      {state.status === 'checking' && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          {mode === 'cashfree' ? 'Checking with Income Tax Department records…' : 'Verifying…'}
        </p>
      )}
      {state.status === 'error' && <ResultBox tone="danger" icon={XCircle} title="Could not verify right now">{state.message}</ResultBox>}
      {state.status === 'done' && reg && reg.verified && (
        <ResultBox tone={reg.name_ok ? 'success' : 'danger'} icon={reg.name_ok ? BadgeCheck : XCircle}
          title={reg.name_ok ? 'PAN verified with Income Tax records' : 'PAN is valid, but the name does not match'}>
          <p>Registered name: <strong>{reg.registered_name || '—'}</strong> · Name match {reg.name_match ?? 0}%</p>
        </ResultBox>
      )}
      {state.status === 'done' && reg && !reg.verified && (
        <ResultBox tone="danger" icon={XCircle} title="PAN not found">{reg.message}</ResultBox>
      )}
      {state.status === 'done' && !reg && state.data?.valid && (
        <ResultBox tone="success" icon={CheckCircle2} title="PAN number is valid">
          <p>Structure and holder type verified instantly.</p>
        </ResultBox>
      )}
    </div>
  );
}

/** Aadhaar input with a live checksum and, with a provider, UIDAI OTP verification. */
export function AadhaarVerify({ value, onChange, error, mode, verified, onVerified, onUseAddress }) {
  const digits = value.replace(/\D/g, '');
  const complete = digits.length === 12;
  const valid = complete && aadhaarIsValid(digits);
  const [otpState, setOtpState] = useState({ status: 'idle' });
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    setOtpState({ status: 'idle' });
    setOtp('');
  }, [digits]);

  useEffect(() => {
    if (!cooldown) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async () => {
    setOtpState({ status: 'sending' });
    try {
      const data = await aadhaarOtp({ aadhaar: digits });
      setOtpState({ status: 'sent', checkId: data.check_id, message: data.message });
      setCooldown(30);
    } catch (e) {
      setOtpState({ status: 'error', message: e.message });
      if (e.retryAfter) setCooldown(e.retryAfter);
    }
  };

  const verify = async () => {
    setOtpState((s) => ({ ...s, status: 'verifying' }));
    try {
      const details = await aadhaarVerify({ check_id: otpState.checkId, otp });
      setOtpState({ status: 'verified' });
      onVerified(details);
    } catch (e) {
      setOtpState((s) => ({ ...s, status: 'sent', message: e.message, failed: true }));
    }
  };

  return (
    <div>
      <Input label="Aadhaar number" required inputMode="numeric" placeholder="1234 5678 9012" value={value}
        error={error} className="font-mono tracking-widest" autoComplete="off"
        hint="Checked instantly, then discarded. DigiBank keeps only the last 4 digits."
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 '))} />

      {digits.length > 0 && !complete && (
        <p className="mt-2 text-xs text-ink-500">{12 - digits.length} more digit{12 - digits.length === 1 ? '' : 's'}</p>
      )}
      {complete && !valid && (
        <ResultBox tone="danger" icon={XCircle} title="Not a valid Aadhaar number">
          <p>The check digit does not match. Re-check all 12 digits.</p>
        </ResultBox>
      )}

      {valid && mode !== 'cashfree' && (
        <ResultBox tone="success" icon={CheckCircle2} title="Aadhaar number is valid">
          <p>Verhoeff checksum verified instantly.</p>
        </ResultBox>
      )}

      {valid && mode === 'cashfree' && !verified && (
        <div className="mt-2 rounded-field border border-brand-100 bg-brand-50 p-3 text-xs text-brand-800">
          <p className="flex items-center gap-1.5 font-semibold">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success-600" /> Valid number. Verify it with UIDAI for instant approval.
          </p>
          {otpState.status !== 'sent' && otpState.status !== 'verifying' ? (
            <Button size="sm" className="mt-2" onClick={send} isLoading={otpState.status === 'sending'} disabled={cooldown > 0}>
              {cooldown > 0 ? `Send OTP again in ${cooldown}s` : 'Send OTP to Aadhaar-linked mobile'}
            </Button>
          ) : (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <Input label="6-digit OTP" inputMode="numeric" maxLength={6} value={otp} containerClassName="w-40"
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} />
              <Button size="sm" onClick={verify} disabled={otp.length !== 6} isLoading={otpState.status === 'verifying'}>Verify</Button>
              <Button size="sm" variant="ghost" onClick={send} disabled={cooldown > 0}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend'}
              </Button>
            </div>
          )}
          {otpState.message && (
            <p className={cn('mt-2', otpState.failed || otpState.status === 'error' ? 'text-danger-600' : 'text-brand-700')}>{otpState.message}</p>
          )}
        </div>
      )}

      {verified && (
        <ResultBox tone="success" icon={ShieldCheck} title="Aadhaar verified with UIDAI">
          <p>{verified.name} · DOB {verified.dob} · {verified.gender === 'F' ? 'Female' : verified.gender === 'M' ? 'Male' : verified.gender}</p>
          {verified.address?.city && (
            <button type="button" onClick={() => onUseAddress(verified.address)}
              className="mt-1.5 inline-flex items-center gap-1 font-semibold underline">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5" /> Use my Aadhaar address
            </button>
          )}
        </ResultBox>
      )}
    </div>
  );
}
