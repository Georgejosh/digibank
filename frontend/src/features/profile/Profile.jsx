import { Link, useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  Calendar,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Mail,
  ShieldCheck,
  Smartphone,
  Timer,
} from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { PageHeader } from '@/components/layout/PageHeader';
import { IDLE_LIMIT_MS } from '@/components/layout/SessionTimeout';
import { useAuth } from '@/hooks/useAuth';
import { usePrivacy } from '@/context/PrivacyContext';
import { formatDate } from '@/utils/date';
import { BiometricSettings } from './BiometricSettings';
import { BankAccounts } from '@/features/banks/BankAccounts';
import { cn } from '@/utils/cn';

const KYC_TONE = { VERIFIED: 'success', SUBMITTED: 'brand', REJECTED: 'danger', PENDING: 'warning' };

/*
 * Mirrors the Django serializers. Shown so users know the rules up front
 * rather than discovering them from an error message.
 */
const LIMITS = [
  ['Deposit into a goal or club', 'Up to ₹2,00,000 per transaction'],
  ['Withdraw an unlocked goal', '₹100 – ₹1,00,000 per transaction'],
  ['Add money to wallet', '₹10 – ₹1,00,000 per top-up (after KYC)'],
  ['Club withdrawals', 'Only with every member’s approval'],
  ['Transfer fees', 'None'],
];

function maskPhone(phone) {
  if (!phone) return '';
  const digits = String(phone);
  return `${digits.slice(0, -4).replace(/\d/g, '•')}${digits.slice(-4)}`;
}

/** Profile & Security: who the account belongs to and how it is protected. */
export function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { hidden, toggle } = usePrivacy();
  const kyc = user?.kyc_status ?? 'PENDING';

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Profile & Security" description="Your account details, linked banks and security settings." />

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* Identity */}
        <Card className="self-start">
          <CardBody className="flex flex-col items-center text-center">
            <Avatar name={user?.name ?? 'DigiBank User'} size="lg" />
            <h2 className="mt-3 text-heading text-ink-900">{user?.name}</h2>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Link to="/app/kyc">
                <Badge tone={KYC_TONE[kyc] ?? 'neutral'} icon={BadgeCheck}>
                  KYC {kyc.toLowerCase()}
                </Badge>
              </Link>
              {user?.is_verified && (
                <Badge tone="success" icon={ShieldCheck}>
                  Verified
                </Badge>
              )}
            </div>
            <dl className="mt-5 w-full space-y-3 text-left text-sm">
              <Detail icon={Mail} label="Email" value={user?.email} />
              <Detail icon={Smartphone} label="Mobile" value={maskPhone(user?.phone)} />
              <Detail icon={Calendar} label="Member since" value={formatDate(user?.date_joined)} />
            </dl>
          </CardBody>
        </Card>

        <div className="min-w-0 space-y-6">
          {/* Security */}
          <Card>
            <CardBody>
              <h2 className="text-heading text-ink-900">Security</h2>
              <ul className="mt-4 divide-y divide-ink-100">
                <SettingRow
                  icon={KeyRound}
                  title="2-step sign-in"
                  description="Password sign-in always needs a one-time code too. Face or fingerprint sign-in counts as both factors."
                  control={<Badge tone="success">Always on</Badge>}
                />
                <SettingRow
                  icon={Timer}
                  title="Auto sign-out"
                  description={`You are signed out after ${IDLE_LIMIT_MS / 60000} minutes without activity.`}
                  control={<Badge tone="success">On</Badge>}
                />
                <SettingRow
                  icon={hidden ? EyeOff : Eye}
                  title="Hide balances"
                  description="Mask balances on screen. Saved on this device only."
                  control={<Switch checked={hidden} onChange={toggle} label="Hide balances" />}
                />
              </ul>
            </CardBody>
          </Card>

          <BiometricSettings />

          <BankAccounts />

          {/* Limits */}
          <Card>
            <CardBody>
              <h2 className="text-heading text-ink-900">Limits & charges</h2>
              <dl className="mt-4 divide-y divide-ink-100 text-sm">
                {LIMITS.map(([label, value]) => (
                  <div key={label} className="flex flex-wrap justify-between gap-2 py-2.5">
                    <dt className="text-ink-600">{label}</dt>
                    <dd className="font-medium text-ink-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Button variant="secondary" leftIcon={LogOut} onClick={signOut}>
            Sign out of DigiBank
          </Button>
        </div>
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3">
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-400" />
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wider text-ink-400">{label}</dt>
        <dd className="truncate font-medium text-ink-900">{value || '—'}</dd>
      </div>
    </div>
  );
}

function SettingRow({ icon: Icon, title, description, control }) {
  return (
    <li className="flex items-center gap-4 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">{title}</p>
        <p className="text-xs text-ink-500">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </li>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'relative h-6 w-11 rounded-full transition-colors',
        checked ? 'bg-brand-600' : 'bg-ink-300'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

export default Profile;
