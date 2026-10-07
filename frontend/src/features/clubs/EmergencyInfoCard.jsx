import { Link } from 'react-router-dom';
import { CheckCheck, ShieldAlert, Timer, UserCheck } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';

/**
 * STATIC EXPLAINER - documents the unanimous-approval rule before it is
 * functional.
 *
 * It ships now on purpose: the whole premise of a club is that your money is
 * not casually reachable, and members need to understand that BEFORE they pay
 * in, not the first time somebody needs the money out.
 *
 * The rule described here is enforced entirely by Django (apps/emergency).
 * Phase 1 renders the request and approval screens but never decides anything.
 */
const RULES = [
  {
    icon: UserCheck,
    title: 'Every member must approve',
    body: 'Not a majority - everyone. One rejection stops the withdrawal outright.',
  },
  {
    icon: Timer,
    title: 'Requests expire in 24 hours',
    body: 'If the club has not fully approved by then, the request lapses and the funds stay locked.',
  },
  {
    icon: CheckCheck,
    title: 'Each approval is verified',
    body: 'Approving needs an OTP, and later a biometric confirmation on a registered device.',
  },
];

export function EmergencyInfoCard() {
  return (
    <Card className="border-accent-200 bg-accent-50/70">
      <CardBody>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white">
            <ShieldAlert aria-hidden="true" className="h-5 w-5 text-accent-600" />
          </span>
          <div>
            <h2 className="text-heading text-accent-900">How emergency withdrawal works</h2>
            <p className="mt-1 text-sm text-accent-800">
              Club money is locked until the target or the deadline. There is exactly one exception.
            </p>
          </div>
        </div>

        <ul className="mt-5 space-y-4">
          {RULES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
              <div>
                <p className="text-sm font-semibold text-accent-900">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-accent-800">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        <Link
          to="/app/emergency"
          className="mt-5 inline-block text-sm font-semibold text-accent-900 underline underline-offset-4 hover:text-accent-700"
        >
          See emergency requests
        </Link>
      </CardBody>
    </Card>
  );
}

export default EmergencyInfoCard;
