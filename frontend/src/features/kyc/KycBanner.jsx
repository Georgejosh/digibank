import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Clock, XCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/utils/cn';

/** Nudge shown until KYC is verified. Renders nothing once it is. */
export function KycBanner({ className }) {
  const { user } = useAuth();
  const status = user?.kyc_status ?? 'PENDING';
  if (status === 'VERIFIED') return null;

  const config = {
    PENDING: {
      icon: BadgeCheck,
      tone: 'border-brand-200 bg-brand-50 text-brand-900',
      title: 'Complete your KYC to start adding money',
      body: 'Takes about 3 minutes - PAN, address proof and a quick selfie.',
      cta: 'Start KYC',
    },
    SUBMITTED: {
      icon: Clock,
      tone: 'border-accent-200 bg-accent-50 text-accent-900',
      title: 'Your KYC is under review',
      body: 'We will notify you as soon as it is approved.',
      cta: 'View status',
    },
    REJECTED: {
      icon: XCircle,
      tone: 'border-danger-100 bg-danger-50 text-danger-700',
      title: 'Your KYC needs attention',
      body: 'Some details could not be verified. Please resubmit.',
      cta: 'Fix now',
    },
  }[status] ?? null;
  if (!config) return null;
  const Icon = config.icon;

  return (
    <Link
      to="/app/kyc"
      className={cn('flex items-center gap-3 rounded-card border p-4 transition-opacity hover:opacity-90', config.tone, className)}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{config.title}</p>
        <p className="mt-0.5 text-xs opacity-80">{config.body}</p>
      </div>
      <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold sm:inline-flex">
        {config.cta} <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </span>
    </Link>
  );
}

export default KycBanner;
