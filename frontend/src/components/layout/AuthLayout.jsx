import { Link, Outlet } from 'react-router-dom';
import { Lock, ShieldCheck, Users } from 'lucide-react';
import { Logo } from './Logo';

/**
 * Two-column shell for the public auth screens: the form on the left, a calm
 * reassurance panel on the right that collapses away on mobile.
 *
 * The right panel is trust-building, not decoration - people are about to hand
 * a student project their phone number, so the promises are stated plainly.
 */
const TRUST_POINTS = [
  {
    icon: Lock,
    title: 'Locked until you get there',
    body: 'Money you deposit stays locked until the goal amount or the deadline is reached.',
  },
  {
    icon: Users,
    title: 'Nobody withdraws alone',
    body: 'Taking money out of a club early needs every single member to approve it.',
  },
  {
    icon: ShieldCheck,
    title: 'Savings only, by design',
    body: 'There is no peer-to-peer transfer in DigiBank. Money goes in, and comes back to you.',
  },
];

export function AuthLayout() {
  return (
    <div className="min-h-dvh bg-ink-50 lg:grid lg:grid-cols-[1fr_minmax(0,28rem)] xl:grid-cols-[1fr_minmax(0,32rem)]">
      {/* Form column */}
      <div className="flex min-h-dvh flex-col px-5 py-8 sm:px-8 lg:min-h-0 lg:px-12 lg:py-10">
        <Link to="/" className="inline-flex w-fit" aria-label="DigiBank home">
          <Logo />
        </Link>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">
            <Outlet />
          </div>
        </div>

        <p className="text-center text-xs text-ink-400">
          A college project build. Do not use real bank details.
        </p>
      </div>

      {/* Reassurance column - hidden on mobile where the form is the priority */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-b from-brand-700 to-brand-950 p-12 lg:flex lg:flex-col lg:justify-center">
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-accent-400/10 blur-3xl"
        />

        <div className="relative">
          <h2 className="text-display max-w-sm text-white">A savings app that doesn&rsquo;t let you spend.</h2>
          <p className="mt-4 max-w-sm text-brand-100">
            Set a goal, save a little every day, and keep the streak going with the people saving
            alongside you.
          </p>

          <ul className="mt-12 space-y-7">
            {TRUST_POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/15">
                  <Icon aria-hidden="true" className="h-5 w-5 text-accent-300" />
                </span>
                <div>
                  <p className="font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-brand-100/90">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

export default AuthLayout;
