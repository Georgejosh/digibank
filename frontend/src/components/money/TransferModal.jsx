import { useRef, useState } from 'react';
import { ArrowDown, Check, CheckCircle2, Copy, Fingerprint, Printer, ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { formatPaise } from '@/utils/money';
import { cn } from '@/utils/cn';

/**
 * The two screens every money movement goes through:
 *
 *   1. REVIEW  - what moves, from where, to where, and the balance afterwards.
 *                Nothing has happened yet; the user can still back out.
 *   2. RECEIPT - the server's answer: reference number and timestamp.
 *
 * The receipt is built only from the API response (`receipt`), never from the
 * numbers the user typed, so it can never claim a transfer the server refused.
 */
export function TransferModal({
  open,
  onClose,
  title,
  amountPaise,
  from,
  to,
  details = [],
  confirmLabel = 'Confirm',
  onConfirm,
  isLoading,
  receipt,
  biometric = false,
  scanning = false,
}) {
  const done = Boolean(receipt);

  // Freeze who-paid-whom while reviewing. Once the transfer lands the page
  // refetches, and a fully withdrawn goal drops out of its list - the receipt
  // must still name it.
  const parties = useRef({ from, to });
  if (!done) parties.current = { from, to };
  const shown = parties.current;

  return (
    <Modal
      open={open}
      onClose={isLoading ? undefined : onClose}
      closeOnBackdrop={!isLoading && !done}
      title={done ? 'Transfer successful' : title}
      description={done ? undefined : 'Check the details before you confirm.'}
      size="sm"
      footer={
        done ? (
          <Button fullWidth onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={onConfirm} isLoading={isLoading} leftIcon={biometric ? Fingerprint : ShieldCheck}>
              {scanning ? 'Waiting for your scan...' : isLoading ? 'Processing...' : confirmLabel}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <Receipt receipt={receipt} from={shown.from} to={shown.to} />
      ) : (
        <>
          <Review amountPaise={amountPaise} from={from} to={to} details={details} />
          {biometric && (
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-brand-700">
              <Fingerprint aria-hidden="true" className="h-4 w-4" />
              You will be asked for your face or fingerprint to confirm.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

function Party({ party, caption }) {
  const Icon = party.icon;
  return (
    <div className="flex items-center gap-3 rounded-field border border-ink-200 bg-white p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{caption}</p>
        <p className="truncate text-sm font-semibold text-ink-900">{party.label}</p>
        {party.sub && <p className="truncate text-xs text-ink-500">{party.sub}</p>}
      </div>
    </div>
  );
}

function Review({ amountPaise, from, to, details }) {
  return (
    <div>
      <p className="text-center text-label text-ink-500">You are moving</p>
      <p className="mt-1 text-center text-display tabular-nums text-ink-900">
        {formatPaise(amountPaise)}
      </p>

      <div className="mt-5 space-y-2">
        <Party party={from} caption="From" />
        <div className="flex justify-center">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-100 text-ink-500">
            <ArrowDown aria-hidden="true" className="h-4 w-4" />
          </span>
        </div>
        <Party party={to} caption="To" />
      </div>

      {details.length > 0 && (
        <dl className="mt-5 divide-y divide-ink-100 rounded-field bg-ink-50 px-4">
          {details.map(({ label, value, emphasis }) => (
            <div key={label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <dt className="text-ink-500">{label}</dt>
              <dd className={cn('tabular-nums', emphasis ? 'font-bold text-ink-900' : 'font-medium text-ink-800')}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function Receipt({ receipt, from, to }) {
  const [copied, setCopied] = useState(false);
  const when = new Date(receipt.created_at ?? Date.now()).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(receipt.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked; the reference is on screen to copy by hand.
    }
  };

  const rows = [
    ['From', from.label],
    ['To', to.label],
    ['Date & time', when],
    ['Status', 'Successful'],
  ];

  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-50 text-success-600 ring-8 ring-success-50/50">
          <CheckCircle2 aria-hidden="true" className="h-8 w-8" />
        </span>
        <p className="mt-4 text-display tabular-nums text-ink-900">{formatPaise(receipt.amount_paise)}</p>
        <p className="mt-1 text-sm text-ink-500">{receipt.message}</p>
      </div>

      <dl className="mt-5 divide-y divide-ink-100 rounded-field border border-ink-200 px-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <dt className="text-ink-500">{label}</dt>
            <dd className="truncate text-right font-medium text-ink-900">{value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <dt className="text-ink-500">Reference</dt>
          <dd className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-ink-900">{receipt.reference}</span>
            <button
              type="button"
              onClick={copy}
              aria-label="Copy reference number"
              className="rounded p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
            >
              {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5 text-success-600" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
            </button>
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => printReceipt({ ...receipt, when, from: from.label, to: to.label })}
        className="mx-auto mt-4 flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
      >
        <Printer aria-hidden="true" className="h-4 w-4" />
        Print or save receipt
      </button>
    </div>
  );
}

/** Opens a bare receipt page and hands it to the browser's print / save-as-PDF dialog. */
function printReceipt({ amount_paise, reference, when, from, to }) {
  const win = window.open('', '_blank', 'width=420,height=600');
  if (!win) return;
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>DigiBank receipt ${esc(reference)}</title>
<style>body{font-family:Inter,system-ui,sans-serif;color:#1A2227;padding:32px;max-width:360px;margin:auto}
h1{font-size:18px;margin:0;color:#145F65}.amt{font-size:32px;font-weight:700;margin:24px 0 4px}
.ok{color:#047857;font-weight:600}table{width:100%;border-collapse:collapse;margin-top:20px;font-size:13px}
td{padding:8px 0;border-bottom:1px solid #DDE4E8}td:last-child{text-align:right;font-weight:600}
p.f{font-size:11px;color:#6B7C87;margin-top:24px}</style></head><body>
<h1>DigiBank</h1><div class="amt">${esc(formatPaise(amount_paise))}</div><div class="ok">Transfer successful</div>
<table><tr><td>From</td><td>${esc(from)}</td></tr><tr><td>To</td><td>${esc(to)}</td></tr>
<tr><td>Date &amp; time</td><td>${esc(when)}</td></tr><tr><td>Reference</td><td>${esc(reference)}</td></tr></table>
<p class="f">This is a system-generated receipt for a simulated transfer in the DigiBank savings app.</p>
<script>window.onload=()=>window.print()</script></body></html>`);
  win.document.close();
}

export default TransferModal;
