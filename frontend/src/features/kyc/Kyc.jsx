import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Home,
  IdCard,
  Lock,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { SelfieCapture } from './SelfieCapture';
import {
  ADDRESS_PROOFS,
  OCCUPATIONS,
  PINCODE_RE,
  STATES,
  aadhaarIsValid,
  ageFrom,
  fileError,
  panError,
} from './kycRules';
import { useKyc, useSubmitKyc } from '@/hooks/useKyc';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/utils/date';
import { cn } from '@/utils/cn';

const STEPS = [
  { key: 'identity', label: 'Identity', icon: IdCard },
  { key: 'address', label: 'Address', icon: Home },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'selfie', label: 'Selfie', icon: Camera },
  { key: 'review', label: 'Review', icon: ShieldCheck },
];

const EMPTY = {
  full_name: '',
  date_of_birth: '',
  pan: '',
  occupation: '',
  address_proof_type: 'AADHAAR',
  aadhaar: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  pincode: '',
  pan_document: null,
  address_document: null,
  selfie: null,
  consent: false,
};

function validateStep(step, f) {
  const e = {};
  if (step === 0) {
    if (f.full_name.trim().length < 3) e.full_name = 'Enter your name exactly as on your PAN card';
    if (!f.date_of_birth) e.date_of_birth = 'Enter your date of birth';
    else if (ageFrom(f.date_of_birth) < 18) e.date_of_birth = 'You must be 18 or older';
    const pe = panError(f.pan);
    if (pe) e.pan = pe;
    if (!f.occupation) e.occupation = 'Choose your occupation';
  }
  if (step === 1) {
    if (f.address_proof_type === 'AADHAAR' && !aadhaarIsValid(f.aadhaar)) e.aadhaar = 'Not a valid Aadhaar number - check all 12 digits';
    if (f.address_line1.trim().length < 5) e.address_line1 = 'Enter your house / street address';
    if (!f.city.trim()) e.city = 'Enter your city';
    if (!f.state) e.state = 'Choose your state';
    if (!PINCODE_RE.test(f.pincode)) e.pincode = 'PIN code must be 6 digits';
  }
  if (step === 2) {
    const a = fileError(f.pan_document);
    const b = fileError(f.address_document);
    if (a) e.pan_document = a;
    if (b) e.address_document = b;
  }
  if (step === 3) {
    const s = fileError(f.selfie, { imagesOnly: true });
    if (s) e.selfie = s;
  }
  if (step === 4 && !f.consent) e.consent = 'Please give consent to continue';
  return e;
}

/**
 * KYC: five short steps, then staff review. Money can only enter or leave
 * DigiBank once this is VERIFIED - the server enforces that on every call.
 */
export function Kyc() {
  const { data, isPending } = useKyc();
  const [resubmitting, setResubmitting] = useState(false);

  const status = data?.status ?? 'PENDING';
  const showForm = status === 'PENDING' || (status === 'REJECTED' && resubmitting);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="KYC verification"
        description="Verify your identity once to add money, link your bank and withdraw. Required by RBI rules for prepaid wallets."
      />
      {isPending ? (
        <Card>
          <CardBody className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-24 w-full" />
          </CardBody>
        </Card>
      ) : showForm ? (
        <KycForm />
      ) : (
        <KycStatusCard data={data} onResubmit={() => setResubmitting(true)} />
      )}
    </div>
  );
}

function KycStatusCard({ data, onResubmit }) {
  const { status, profile } = data;
  const config = {
    SUBMITTED: {
      icon: Clock,
      tone: 'bg-accent-50 text-accent-700',
      title: 'Under review',
      body: 'Thanks! Our team is checking your documents. This usually takes less than one working day. We will notify you as soon as it is done.',
    },
    VERIFIED: {
      icon: BadgeCheck,
      tone: 'bg-success-50 text-success-600',
      title: 'You are verified',
      body: 'Your identity is confirmed. You can now link your bank account and add money to your wallet.',
    },
    REJECTED: {
      icon: XCircle,
      tone: 'bg-danger-50 text-danger-600',
      title: 'Verification unsuccessful',
      body: profile?.rejection_reason
        ? `Reason: ${profile.rejection_reason}`
        : 'Some details could not be verified. Please check and resubmit.',
    },
  }[status];
  const Icon = config.icon;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardBody className="flex flex-col items-center py-10 text-center">
          <span className={cn('flex h-16 w-16 items-center justify-center rounded-full', config.tone)}>
            <Icon aria-hidden="true" className="h-8 w-8" />
          </span>
          <h2 className="mt-4 text-title text-ink-900">{config.title}</h2>
          <p className="mt-2 max-w-md text-sm text-ink-600">{config.body}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {status === 'VERIFIED' && (
              <>
                <Link to="/app/wallet" className="inline-flex h-11 items-center gap-2 rounded-field bg-brand-700 px-5 text-sm font-semibold text-white shadow-field hover:bg-brand-800">
                  Add money <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
                <Link to="/app/profile" className="inline-flex h-11 items-center rounded-field bg-white px-5 text-sm font-semibold text-brand-800 shadow-field ring-1 ring-inset ring-ink-200 hover:bg-ink-50">
                  Link a bank account
                </Link>
              </>
            )}
            {status === 'REJECTED' && <Button onClick={onResubmit}>Resubmit KYC</Button>}
          </div>
        </CardBody>
      </Card>

      {profile && (
        <Card className="self-start">
          <CardBody>
            <h3 className="text-sm font-semibold text-ink-900">Submitted details</h3>
            <dl className="mt-3 space-y-2.5 text-sm">
              {[
                ['Name', profile.full_name],
                ['Date of birth', formatDate(profile.date_of_birth)],
                ['PAN', profile.masked_pan],
                ['Aadhaar', profile.aadhaar_last4 ? `XXXX XXXX ${profile.aadhaar_last4}` : '—'],
                ['City', `${profile.city}, ${profile.state} ${profile.pincode}`],
                ['Submitted', formatDate(profile.submitted_at)],
                ...(profile.reviewed_at ? [['Reviewed', formatDate(profile.reviewed_at)]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-ink-500">{k}</dt>
                  <dd className="truncate text-right font-medium text-ink-900">{v}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function KycForm() {
  const { user } = useAuth();
  const submit = useSubmitKyc();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => ({ ...EMPTY, full_name: user?.name ?? '' }));
  const [errors, setErrors] = useState({});

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const next = () => {
    const e = validateStep(step, form);
    setErrors(e);
    if (!Object.keys(e).length) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const send = async () => {
    const e = validateStep(4, form);
    setErrors(e);
    if (Object.keys(e).length) return;
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (v === null || v === undefined) return;
      fd.append(k, typeof v === 'boolean' ? String(v) : v);
    });
    try {
      await submit.mutateAsync(fd);
    } catch (error) {
      // Jump back to whichever step holds the field the server complained about.
      const fieldErrors = error.fieldErrors ?? {};
      setErrors(fieldErrors);
      const stepFields = [
        ['full_name', 'date_of_birth', 'pan', 'occupation'],
        ['aadhaar', 'address_line1', 'city', 'state', 'pincode', 'address_proof_type'],
        ['pan_document', 'address_document'],
        ['selfie'],
      ];
      const target = stepFields.findIndex((fields) => fields.some((f) => fieldErrors[f]));
      if (target >= 0) setStep(target);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card>
        {/* Stepper */}
        <ol className="flex items-center gap-1 overflow-x-auto border-b border-ink-100 px-5 py-4">
          {STEPS.map(({ key, label, icon: Icon }, i) => (
            <li key={key} className="flex items-center gap-1">
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                  i === step ? 'bg-brand-700 text-white' : i < step ? 'bg-success-50 text-success-700' : 'text-ink-400'
                )}
              >
                {i < step ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> : <Icon aria-hidden="true" className="h-3.5 w-3.5" />}
                <span className={cn(i !== step && 'hidden sm:inline')}>{label}</span>
              </span>
              {i < STEPS.length - 1 && <span aria-hidden="true" className="h-px w-3 bg-ink-200 sm:w-5" />}
            </li>
          ))}
        </ol>

        <CardBody className="space-y-4">
          {step === 0 && (
            <>
              <Input label="Full name (as on PAN card)" required value={form.full_name} error={errors.full_name}
                onChange={(e) => set('full_name', e.target.value)} autoComplete="name" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Date of birth" type="date" required value={form.date_of_birth} error={errors.date_of_birth}
                  max={new Date().toISOString().slice(0, 10)} onChange={(e) => set('date_of_birth', e.target.value)} />
                <Input label="PAN number" required placeholder="ABCDE1234F" maxLength={10} value={form.pan} error={errors.pan}
                  className="font-mono uppercase tracking-widest" autoComplete="off"
                  onChange={(e) => set('pan', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
              </div>
              <Select label="Occupation" required value={form.occupation} error={errors.occupation}
                onChange={(e) => set('occupation', e.target.value)}>
                <option value="">Choose one</option>
                {OCCUPATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </>
          )}

          {step === 1 && (
            <>
              <Select label="Address proof" required value={form.address_proof_type}
                onChange={(e) => set('address_proof_type', e.target.value)}>
                {ADDRESS_PROOFS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
              {form.address_proof_type === 'AADHAAR' && (
                <Input label="Aadhaar number" required inputMode="numeric" placeholder="1234 5678 9012" value={form.aadhaar}
                  error={errors.aadhaar} className="font-mono tracking-widest" autoComplete="off"
                  hint="Checked here and on our server, then discarded. We keep only the last 4 digits."
                  onChange={(e) => set('aadhaar', e.target.value.replace(/\D/g, '').slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 '))} />
              )}
              <Input label="House / flat, street" required value={form.address_line1} error={errors.address_line1}
                onChange={(e) => set('address_line1', e.target.value)} autoComplete="address-line1" />
              <Input label="Area, landmark (optional)" value={form.address_line2}
                onChange={(e) => set('address_line2', e.target.value)} autoComplete="address-line2" />
              <div className="grid gap-4 sm:grid-cols-3">
                <Input label="City" required value={form.city} error={errors.city}
                  onChange={(e) => set('city', e.target.value)} autoComplete="address-level2" />
                <Select label="State" required value={form.state} error={errors.state}
                  onChange={(e) => set('state', e.target.value)}>
                  <option value="">Choose</option>
                  {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
                <Input label="PIN code" required inputMode="numeric" maxLength={6} value={form.pincode} error={errors.pincode}
                  onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))} autoComplete="postal-code" />
              </div>
            </>
          )}

          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FileDrop label="PAN card" hint="Front side, all corners visible" file={form.pan_document}
                error={errors.pan_document} onChange={(f) => set('pan_document', f)} />
              <FileDrop
                label={ADDRESS_PROOFS.find(([v]) => v === form.address_proof_type)?.[1] ?? 'Address proof'}
                hint="Side showing your address. Mask the first 8 Aadhaar digits if you like."
                file={form.address_document} error={errors.address_document}
                onChange={(f) => set('address_document', f)} />
            </div>
          )}

          {step === 3 && (
            <div className="py-2">
              <SelfieCapture value={form.selfie} onChange={(f) => set('selfie', f)} />
              {errors.selfie && <p role="alert" className="mt-2 text-center text-xs font-medium text-danger-600">{errors.selfie}</p>}
            </div>
          )}

          {step === 4 && (
            <>
              <dl className="divide-y divide-ink-100 rounded-field border border-ink-200 px-4 text-sm">
                {[
                  ['Name', form.full_name],
                  ['Date of birth', formatDate(form.date_of_birth)],
                  ['PAN', form.pan],
                  ['Occupation', OCCUPATIONS.find(([v]) => v === form.occupation)?.[1]],
                  ['Address', [form.address_line1, form.address_line2, form.city, form.state, form.pincode].filter(Boolean).join(', ')],
                  ['Address proof', ADDRESS_PROOFS.find(([v]) => v === form.address_proof_type)?.[1]],
                  ['Documents', `${form.pan_document?.name ?? '—'}, ${form.address_document?.name ?? '—'}`],
                  ['Selfie', form.selfie ? 'Captured' : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2.5">
                    <dt className="shrink-0 text-ink-500">{k}</dt>
                    <dd className="truncate text-right font-medium text-ink-900">{v}</dd>
                  </div>
                ))}
              </dl>
              <Checkbox
                checked={form.consent}
                onChange={(e) => set('consent', e.target.checked)}
                error={errors.consent}
                label="I confirm these details are mine and correct, and I consent to DigiBank verifying them and keeping these documents securely for KYC as required by law."
              />
            </>
          )}
        </CardBody>

        <div className="flex items-center justify-between gap-3 border-t border-ink-100 px-5 py-4">
          <Button variant="ghost" leftIcon={ArrowLeft} onClick={() => setStep((s) => s - 1)} disabled={step === 0 || submit.isPending}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button rightIcon={ArrowRight} onClick={next}>Continue</Button>
          ) : (
            <Button leftIcon={ShieldCheck} onClick={send} isLoading={submit.isPending}>
              {submit.isPending ? 'Uploading...' : 'Submit for verification'}
            </Button>
          )}
        </div>
      </Card>

      <aside className="space-y-4">
        <Card>
          <CardBody>
            <h3 className="text-sm font-semibold text-ink-900">Keep these ready</h3>
            <ul className="mt-3 space-y-2 text-xs text-ink-600">
              <li className="flex gap-2"><IdCard aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-600" /> PAN card (photo or PDF)</li>
              <li className="flex gap-2"><Home aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-600" /> Aadhaar, passport, voter ID or driving licence</li>
              <li className="flex gap-2"><Camera aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-600" /> A camera for a quick selfie</li>
            </ul>
          </CardBody>
        </Card>
        <Card className="border-success-100 bg-success-50/40">
          <CardBody>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <Lock aria-hidden="true" className="h-4 w-4 text-success-600" /> How we protect it
            </h3>
            <ul className="mt-3 space-y-1.5 text-xs text-ink-600">
              <li>• PAN is encrypted on our servers</li>
              <li>• Only the last 4 Aadhaar digits are kept</li>
              <li>• Documents are never publicly accessible</li>
              <li>• Only verification staff can view them, and every view is logged</li>
            </ul>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

function FileDrop({ label, hint, file, error, onChange }) {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div>
      <p className="mb-1.5 text-label text-ink-700">
        {label}
        <span className="ml-0.5 text-danger-600" aria-hidden="true">*</span>
      </p>
      <label
        className={cn(
          'flex h-44 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-field border-2 border-dashed text-center transition-colors',
          error ? 'border-danger-500 bg-danger-50/40' : file ? 'border-brand-300 bg-brand-50/40' : 'border-ink-200 hover:border-brand-300'
        )}
      >
        {preview ? (
          <img src={preview} alt={`${label} preview`} className="h-full w-full object-contain" />
        ) : file ? (
          <>
            <FileText aria-hidden="true" className="h-8 w-8 text-brand-600" />
            <span className="max-w-[90%] truncate text-xs font-medium text-ink-700">{file.name}</span>
          </>
        ) : (
          <>
            <Upload aria-hidden="true" className="h-7 w-7 text-ink-400" />
            <span className="text-sm font-semibold text-brand-700">Choose file</span>
            <span className="text-[11px] text-ink-400">JPG, PNG, WEBP or PDF · max 5 MB</span>
          </>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && onChange(e.target.files[0])}
        />
      </label>
      {error ? (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger-600">{error}</p>
      ) : (
        <p className="mt-1.5 text-xs text-ink-500">{hint}</p>
      )}
    </div>
  );
}

export default Kyc;
