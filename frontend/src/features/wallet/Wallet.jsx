import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Info,
  Landmark,
  Plus,
  Receipt,
  ShieldCheck,
  Vault,
  Wallet as WalletIcon,
} from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MoneyInput, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Amount, PrivacyToggle } from '@/components/money/Amount';
import { TransferModal } from '@/components/money/TransferModal';
import { WalletEntryRow } from './WalletEntryRow';
import { useAuth } from '@/hooks/useAuth';
import {
  useBankAccounts,
  useCreateWalletDeposit,
  useCreateWalletWithdrawal,
  useGatewayTopup,
  useWalletTransactions,
} from '@/hooks/useDeposits';
import { useBiometricApproval } from '@/hooks/useBiometrics';
import { usePaymentsConfig } from '@/hooks/useKyc';
import { KycBanner } from '@/features/kyc/KycBanner';
import { BankAccounts } from '@/features/banks/BankAccounts';
import { useToast } from '@/context/ToastContext';
import { formatPaise, rupeesToPaise } from '@/utils/money';
import { csvDateTime, downloadCsv, paiseToCsv } from '@/utils/csv';
import { cn } from '@/utils/cn';

const QUICK_AMOUNTS = [500, 1000, 5000, 10000];
const STATEMENT_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'in', label: 'Money in' },
  { value: 'out', label: 'Money out' },
];

/**
 * The Digital Wallet: the user's only unrestricted money.
 *
 *   Bank  <->  Wallet  <->  DigiLocker compartments
 *
 * This page handles the left-hand arrow. DigiLocker handles the right.
 */
export function Wallet() {
  const { user } = useAuth();
  const walletPaise = user?.digital_wallet_balance_paise ?? 0;

  const { data: bankAccounts } = useBankAccounts();
  const { data: statement, isPending: statementLoading } = useWalletTransactions();
  const simulatedTopUp = useCreateWalletDeposit();
  const gatewayTopUp = useGatewayTopup();
  const { data: payCfg } = usePaymentsConfig();
  const gatewayMode = payCfg?.provider === 'razorpay';
  const topUp = gatewayMode ? gatewayTopUp : simulatedTopUp;
  const kycVerified = user?.kyc_status === 'VERIFIED';
  const toBank = useCreateWalletWithdrawal();
  const biometric = useBiometricApproval();
  const toast = useToast();

  const [mode, setMode] = useState('add');
  const [amount, setAmount] = useState('');
  const [bankId, setBankId] = useState('');
  const [touched, setTouched] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [filter, setFilter] = useState('all');

  const isAdd = mode === 'add';
  const mutation = isAdd ? topUp : toBank;
  const bank = bankAccounts?.find((b) => String(b.id) === String(bankId)) ?? bankAccounts?.[0];
  const bankLabel = bank ? `${bank.bank_name} · ${bank.masked_number || bank.upi_id}` : 'Your bank account';

  const amountRupees = Number(amount);
  const amountPaise = rupeesToPaise(amount);
  let amountError = null;
  const minTopup = payCfg?.min_paise ?? 1000;
  const maxTopup = payCfg?.max_paise ?? 10000000;
  if (amount === '' || !Number.isFinite(amountRupees) || amountRupees <= 0) amountError = 'Enter an amount';
  else if (isAdd && amountPaise < minTopup) amountError = `Minimum top-up is ${formatPaise(minTopup, { showDecimals: false })}`;
  else if (isAdd && amountPaise > maxTopup) amountError = `Maximum top-up is ${formatPaise(maxTopup, { showDecimals: false })}`;
  else if (!isAdd && amountPaise > walletPaise) amountError = 'More than your wallet balance';
  else if (!isAdd && !bank) amountError = 'Link a bank account first';
  const blockedReason = !kycVerified
    ? 'Complete KYC to move money in or out'
    : isAdd && !gatewayMode && !payCfg?.simulated_allowed
      ? 'Payment gateway is not configured'
      : null;

  const walletAfter = walletPaise + (isAdd ? amountPaise : -amountPaise);

  const thisMonth = useMemo(() => {
    const now = new Date();
    const rows = (statement ?? []).filter((e) => {
      const d = new Date(e.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    return {
      in: rows.filter((e) => e.is_credit).reduce((s, e) => s + e.amount_paise, 0),
      out: rows.filter((e) => !e.is_credit).reduce((s, e) => s + e.amount_paise, 0),
    };
  }, [statement]);

  const visibleStatement = (statement ?? []).filter(
    (e) => filter === 'all' || (filter === 'in' ? e.is_credit : !e.is_credit)
  );

  const switchMode = (next) => {
    setMode(next);
    setAmount('');
    setTouched(false);
  };

  const openReview = () => {
    setTouched(true);
    if (!amountError && !blockedReason) {
      setReceipt(null);
      setReviewOpen(true);
    }
  };

  const confirm = async () => {
    let biometricToken;
    if (!isAdd) {
      try {
        biometricToken = await biometric.approve();
      } catch (error) {
        toast.error('Scan not confirmed', error.message);
        return;
      }
    }
    try {
      const data = await mutation.mutateAsync({
        amount_paise: amountPaise,
        linked_bank_account_id: bank ? Number(bank.id) : null,
        biometric_token: biometricToken,
      });
      setReceipt({
        amount_paise: data.transaction?.amount_paise ?? amountPaise,
        reference: data.transaction?.reference ?? '-',
        created_at: data.transaction?.created_at,
        message: isAdd ? 'Added to your Digital Wallet' : `Withdrawal to ${bankLabel} recorded`,
      });
      setAmount('');
      setTouched(false);
    } catch {
      setReviewOpen(false);
    }
  };

  const exportStatement = () => {
    downloadCsv(`digibank-wallet-statement-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Date', 'Reference', 'Type', 'Description', 'Credit (INR)', 'Debit (INR)', 'Balance (INR)'],
      ...(statement ?? []).map((e) => [
        csvDateTime(e.created_at),
        e.reference,
        e.kind_label,
        e.description,
        e.is_credit ? paiseToCsv(e.amount_paise) : '',
        e.is_credit ? '' : paiseToCsv(e.amount_paise),
        paiseToCsv(e.balance_after_paise),
      ]),
    ]);
  };

  const bankParty =
    isAdd && gatewayMode && !bank
      ? { icon: Landmark, label: 'UPI / netbanking / card', sub: 'Secured by Razorpay' }
      : { icon: Landmark, label: bankLabel, sub: bank?.branch || (isAdd && !gatewayMode ? 'Test mode' : 'Linked account') };
  const walletParty = { icon: WalletIcon, label: 'Digital Wallet', sub: user?.name };

  return (
    <div className="animate-fade-in">
      <header className="mb-6">
        <h1 className="text-title text-ink-900">Digital Wallet</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">
          Your unrestricted money. Top up from your bank, lock it into DigiLocker, and withdraw back
          to your bank any time.
        </p>
      </header>

      <KycBanner className="mb-6" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {/* ------------------------------------------- Wallet card */}
          <section className="relative overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-brand-950 via-brand-900 to-brand-700 p-6 text-white shadow-card-hover sm:p-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full border-[28px] border-white/5" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-16 h-56 w-56 rounded-full border-[20px] border-white/5" />

            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-200">DigiBank Wallet</p>
                <p className="mt-0.5 text-sm text-white/80">{user?.name}</p>
              </div>
              <PrivacyToggle tone="dark" />
            </div>

            <p className="relative mt-6 text-sm text-brand-100">Available balance</p>
            <p className="relative mt-1 text-[2.5rem] font-bold leading-none tracking-tight">
              <Amount paise={walletPaise} />
            </p>

            <div className="relative mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <HeroAction icon={Plus} label="Add money" onClick={() => switchMode('add')} />
              <HeroAction icon={Landmark} label="To bank" onClick={() => switchMode('withdraw')} />
              <HeroAction icon={Vault} label="Lock money" to="/app/digilocker?mode=deposit" />
              <HeroAction icon={Receipt} label="Statements" to="/app/transactions" />
            </div>
          </section>

          {/* ------------------------------------------- This month */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardBody className="flex items-center gap-3 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-50 text-success-600">
                  <ArrowDownLeft aria-hidden="true" className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-label text-ink-500">In this month</p>
                  <p className="truncate text-lg font-bold text-ink-900">
                    <Amount paise={thisMonth.in} sign="+" />
                  </p>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="flex items-center gap-3 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
                  <ArrowUpRight aria-hidden="true" className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-label text-ink-500">Out this month</p>
                  <p className="truncate text-lg font-bold text-ink-900">
                    <Amount paise={thisMonth.out} sign="-" />
                  </p>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* ------------------------------------------- Statement */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
              <h2 className="text-heading text-ink-900">Wallet statement</h2>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 rounded-full bg-ink-100 p-1">
                  {STATEMENT_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFilter(f.value)}
                      aria-pressed={filter === f.value}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                        filter === f.value ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={Download}
                  onClick={exportStatement}
                  disabled={!statement?.length}
                >
                  CSV
                </Button>
              </div>
            </div>
            {statementLoading ? (
              <SkeletonList rows={4} />
            ) : visibleStatement.length ? (
              <ul className="divide-y divide-ink-100">
                {visibleStatement.map((entry) => (
                  <WalletEntryRow key={entry.id} entry={entry} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Receipt}
                title="No wallet activity yet"
                description="Top-ups, bank withdrawals and DigiLocker moves will appear here."
              />
            )}
          </Card>
        </div>

        {/* ----------------------------------------------- Action panel */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardBody className="space-y-4">
              <div role="tablist" aria-label="Wallet action" className="grid grid-cols-2 gap-1 rounded-field bg-ink-100 p-1">
                {[
                  { value: 'add', label: 'Add money' },
                  { value: 'withdraw', label: 'Withdraw to bank' },
                ].map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    role="tab"
                    aria-selected={mode === t.value}
                    onClick={() => switchMode(t.value)}
                    className={cn(
                      'rounded-[0.5rem] px-3 py-2 text-sm font-semibold transition-colors',
                      mode === t.value ? 'bg-white text-brand-800 shadow-sm' : 'text-ink-500 hover:text-ink-800'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div>
                <MoneyInput
                  label="Amount"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => amount && setTouched(true)}
                  error={touched ? amountError : undefined}
                />
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {QUICK_AMOUNTS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setAmount(String(value));
                        setTouched(true);
                      }}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                        amountRupees === value ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
                      )}
                    >
                      ₹{value.toLocaleString('en-IN')}
                    </button>
                  ))}
                  {!isAdd && (
                    <button
                      type="button"
                      disabled={walletPaise <= 0}
                      onClick={() => {
                        setAmount(String(Math.floor(walletPaise / 100)));
                        setTouched(true);
                      }}
                      className="rounded-full px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50 disabled:opacity-50"
                    >
                      Max
                    </button>
                  )}
                </div>
              </div>

              {bankAccounts?.length ? (
                <Select
                  label={isAdd ? 'From bank account' : 'To bank account'}
                  value={bank ? String(bank.id) : ''}
                  onChange={(e) => setBankId(e.target.value)}
                >
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} · {b.masked_number || b.upi_id}
                      {b.is_primary ? ' (primary)' : ''}
                    </option>
                  ))}
                </Select>
              ) : (
                <div className="flex items-start gap-2.5 rounded-field bg-ink-50 p-3 text-xs text-ink-600">
                  <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                  <p>
                    {isAdd
                      ? 'You can pay by UPI, netbanking or card. Link your bank below to pre-select it next time.'
                      : 'Link a bank account below to withdraw to it.'}
                  </p>
                </div>
              )}

              {blockedReason && (
                <p className="rounded-field bg-accent-50 p-3 text-xs font-medium text-accent-900">{blockedReason}.</p>
              )}

              {amountPaise > 0 && !amountError && (
                <div className="flex justify-between rounded-field bg-brand-50/60 px-3.5 py-2.5 text-sm">
                  <span className="text-ink-600">Wallet after</span>
                  <span className="font-semibold tabular-nums text-ink-900">{formatPaise(walletAfter)}</span>
                </div>
              )}

              <Button size="lg" fullWidth onClick={openReview} disabled={Boolean(blockedReason)}>
                {isAdd ? (gatewayMode ? 'Continue to payment' : 'Review top-up') : 'Review withdrawal'}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink-400">
                <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                {isAdd
                  ? gatewayMode
                    ? `Secured by Razorpay${payCfg?.test_mode ? ' · TEST MODE, no real money' : ''}`
                    : 'Test mode · payment gateway not configured, no real money moves'
                  : 'Bank payouts are settled manually in this version'}
              </p>
            </CardBody>
          </Card>

          <BankAccounts compact />

          <Card>
            <CardBody>
              <h3 className="text-sm font-semibold text-ink-900">Where your money goes</h3>
              <ol className="mt-3 space-y-3 text-xs text-ink-600">
                <FlowStep n={1} title="Bank → Wallet">Top up whenever you like. Wallet money is never locked.</FlowStep>
                <FlowStep n={2} title="Wallet → DigiLocker">Lock it into a goal or club so you are not tempted to spend it.</FlowStep>
                <FlowStep n={3} title="DigiLocker → Wallet → Bank">Unlocked savings come back here first, then out to your bank.</FlowStep>
              </ol>
              <Link
                to="/app/digilocker"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
              >
                <Vault aria-hidden="true" className="h-4 w-4" /> Open DigiLocker
              </Link>
            </CardBody>
          </Card>
        </aside>
      </div>

      <TransferModal
        open={reviewOpen}
        onClose={() => {
          if (mutation.isPending) return;
          setReviewOpen(false);
          setReceipt(null);
        }}
        title={isAdd ? 'Confirm top-up' : 'Confirm withdrawal to bank'}
        amountPaise={amountPaise}
        from={isAdd ? bankParty : walletParty}
        to={isAdd ? walletParty : bankParty}
        confirmLabel={isAdd ? (gatewayMode ? 'Pay now' : 'Add money') : biometric.required ? 'Scan & withdraw' : 'Withdraw'}
        biometric={!isAdd && biometric.required}
        details={[
          { label: 'Transfer fee', value: '₹0.00' },
          { label: 'Wallet after', value: formatPaise(walletAfter), emphasis: true },
        ]}
        onConfirm={confirm}
        isLoading={mutation.isPending || biometric.isScanning}
        scanning={biometric.isScanning}
        receipt={receipt}
      />
    </div>
  );
}

function HeroAction({ icon: Icon, label, onClick, to }) {
  const className =
    'flex flex-col items-center gap-1.5 rounded-xl bg-white/10 px-2 py-3 text-xs font-semibold text-white ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/20';
  const content = (
    <>
      <Icon aria-hidden="true" className="h-5 w-5" />
      {label}
    </>
  );
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function FlowStep({ n, title, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white">
        {n}
      </span>
      <div>
        <p className="font-semibold text-ink-900">{title}</p>
        <p className="mt-0.5 leading-relaxed">{children}</p>
      </div>
    </li>
  );
}

export default Wallet;
