import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, CheckCircle2, Landmark, Loader2, Plus, Star, Trash2 } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useBankAccounts } from '@/hooks/useDeposits';
import { useAddBankAccount, useMakePrimaryBankAccount, useRemoveBankAccount } from '@/hooks/useKyc';
import { lookupIfsc } from '@/services/kycService';

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * Linked bank accounts: list, add (with live IFSC lookup), make primary,
 * remove. Adding requires verified KYC and an account in the user's own name.
 */
export function BankAccounts({ compact = false }) {
  const { user } = useAuth();
  const { data: banks, isPending } = useBankAccounts();
  const remove = useRemoveBankAccount();
  const makePrimary = useMakePrimaryBankAccount();
  const [adding, setAdding] = useState(false);
  const verified = user?.kyc_status === 'VERIFIED';
  const atLimit = (banks?.length ?? 0) >= 3;

  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={compact ? 'text-sm font-semibold text-ink-900' : 'text-heading text-ink-900'}>Bank accounts</h2>
          {verified && !atLimit && (
            <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setAdding(true)}>
              Add account
            </Button>
          )}
        </div>

        {!verified && (
          <div className="mt-3 flex items-start gap-2.5 rounded-field bg-accent-50 p-3 text-xs text-accent-900">
            <BadgeCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
            <p>
              Complete <Link to="/app/kyc" className="font-semibold underline">KYC verification</Link> to link your
              bank account and add money.
            </p>
          </div>
        )}

        {isPending ? (
          <Skeleton className="mt-4 h-16 w-full" />
        ) : banks?.length ? (
          <ul className="mt-4 space-y-2">
            {banks.map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-field border border-ink-200 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Landmark aria-hidden="true" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink-900">
                    {b.bank_name}
                    {b.is_primary && <Badge tone="brand">Primary</Badge>}
                  </p>
                  <p className="truncate text-xs text-ink-500">
                    {b.masked_number} · {b.ifsc}
                    {b.branch ? ` · ${b.branch}` : ''}
                  </p>
                </div>
                {!b.is_primary && (
                  <button
                    type="button"
                    onClick={() => makePrimary.mutate(b.id)}
                    title="Make primary"
                    aria-label={`Make ${b.bank_name} ${b.masked_number} primary`}
                    className="rounded-field p-2 text-ink-400 hover:bg-ink-50 hover:text-brand-700"
                  >
                    <Star aria-hidden="true" className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove.mutate(b.id)}
                  disabled={remove.isPending}
                  aria-label={`Remove ${b.bank_name} ${b.masked_number}`}
                  className="rounded-field p-2 text-ink-400 hover:bg-danger-50 hover:text-danger-600 disabled:opacity-50"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          verified && <p className="mt-3 text-sm text-ink-500">No bank account linked yet.</p>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
          Accounts must be in your own name. DigiBank keeps only the last 4 digits - the full number is never stored.
        </p>
      </CardBody>

      <AddBankModal open={adding} onClose={() => setAdding(false)} />
    </Card>
  );
}

function AddBankModal({ open, onClose }) {
  const { user } = useAuth();
  const add = useAddBankAccount();
  const [form, setForm] = useState({
    account_holder_name: user?.name ?? '',
    account_number: '',
    confirm_account_number: '',
    ifsc: '',
    account_type: 'SAVINGS',
  });
  const [branch, setBranch] = useState({ state: 'idle', info: null, error: null });
  const [error, setError] = useState(null);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError(null);
  };

  // Live IFSC lookup as soon as the code is complete.
  useEffect(() => {
    if (!IFSC_RE.test(form.ifsc)) {
      setBranch({ state: 'idle', info: null, error: null });
      return undefined;
    }
    let live = true;
    setBranch({ state: 'loading', info: null, error: null });
    lookupIfsc(form.ifsc)
      .then((info) => live && setBranch({ state: 'ok', info, error: null }))
      .catch((e) => live && setBranch({ state: 'error', info: null, error: e.message }));
    return () => {
      live = false;
    };
  }, [form.ifsc]);

  const mismatch = form.confirm_account_number && form.account_number !== form.confirm_account_number;
  const canSubmit =
    form.account_holder_name.trim() &&
    /^\d{9,18}$/.test(form.account_number) &&
    !mismatch &&
    branch.state === 'ok';

  const submit = async () => {
    try {
      await add.mutateAsync(form);
      onClose();
      setForm((f) => ({ ...f, account_number: '', confirm_account_number: '', ifsc: '' }));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={add.isPending ? undefined : onClose}
      title="Link a bank account"
      description="Use a savings or current account in your own name."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={add.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit} isLoading={add.isPending} leftIcon={Landmark}>
            Link account
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Account holder name" required value={form.account_holder_name}
          hint="Must match the name on your KYC" onChange={(e) => set('account_holder_name', e.target.value)} />
        <Input label="Account number" required inputMode="numeric" autoComplete="off" value={form.account_number}
          className="font-mono tracking-wider" onChange={(e) => set('account_number', e.target.value.replace(/\D/g, '').slice(0, 18))} />
        <Input label="Re-enter account number" required inputMode="numeric" autoComplete="off" value={form.confirm_account_number}
          className="font-mono tracking-wider" error={mismatch ? 'Account numbers do not match' : undefined}
          onPaste={(e) => e.preventDefault()}
          onChange={(e) => set('confirm_account_number', e.target.value.replace(/\D/g, '').slice(0, 18))} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="IFSC code" required placeholder="HDFC0001234" maxLength={11} value={form.ifsc}
            className="font-mono uppercase tracking-wider"
            error={branch.state === 'error' ? branch.error : undefined}
            onChange={(e) => set('ifsc', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          <Select label="Account type" value={form.account_type} onChange={(e) => set('account_type', e.target.value)}>
            <option value="SAVINGS">Savings</option>
            <option value="CURRENT">Current</option>
          </Select>
        </div>
        {branch.state === 'loading' && (
          <p className="flex items-center gap-2 text-xs text-ink-500">
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> Looking up branch…
          </p>
        )}
        {branch.state === 'ok' && (
          <div className="flex items-start gap-2.5 rounded-field bg-success-50 p-3 text-xs text-success-700">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">{branch.info.bank}</p>
              <p>{[branch.info.branch, branch.info.city, branch.info.state].filter(Boolean).join(', ')}</p>
            </div>
          </div>
        )}
        {error && <p role="alert" className="text-sm font-medium text-danger-600">{error}</p>}
      </div>
    </Modal>
  );
}

export default BankAccounts;
