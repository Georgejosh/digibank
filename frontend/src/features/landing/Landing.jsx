import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Flame,
  Lock,
  PiggyBank,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { AvatarGroup } from '@/components/ui/Avatar';
import { formatPaise } from '@/utils/money';

const FEATURES = [
  {
    icon: Lock,
    title: 'Locked until you get there',
    body: 'Every deposit is held until the goal amount is reached or the deadline arrives. No impulse withdrawal at 1am.',
  },
  {
    icon: Users,
    title: 'Save as a club',
    body: 'Pool money with friends or family for a trip, a gift, or a washing machine. Everyone sees the same progress bar.',
  },
  {
    icon: ShieldCheck,
    title: 'Nobody withdraws alone',
    body: 'Real emergencies happen. Pulling money out early needs an approval from every single club member.',
  },
  {
    icon: Flame,
    title: 'A streak worth keeping',
    body: 'Save something every day and build a streak. Small amounts, kept up, are how goals actually get funded.',
  },
];

const STEPS = [
  { step: '01', title: 'Set a goal', body: 'Name it, pick an amount and a date. On your own or with a club.' },
  { step: '02', title: 'Deposit as you go', body: 'Add money from a linked bank account whenever you can.' },
  { step: '03', title: 'Unlock at the finish', body: 'Hit the target or the deadline, and the money is yours to withdraw.' },
];

export function Landing() {
  return (
    <div className="min-h-dvh bg-white">
      {/* ---------------------------------------------------------- Nav */}
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Logo />
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/login"
              className="rounded-field px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-50 sm:px-4"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="inline-flex h-10 items-center justify-center rounded-field bg-brand-700 px-4 text-sm font-semibold text-white shadow-field transition-colors hover:bg-brand-800"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      {/* --------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute -right-40 -top-40 h-[30rem] w-[30rem] rounded-full bg-brand-100/60 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-52 -left-40 h-[26rem] w-[26rem] rounded-full bg-accent-100/50 blur-3xl"
        />

        <div className="relative mx-auto grid max-w-6xl gap-14 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-200">
              <PiggyBank aria-hidden="true" className="h-3.5 w-3.5" />
              Savings only. No peer-to-peer transfers.
            </span>

            <h1 className="text-display mt-6 max-w-xl text-ink-900 sm:text-5xl">
              A savings app that doesn&rsquo;t let you spend.
            </h1>

            <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-600">
              DigiBank locks your money towards a goal you actually named &mdash; on your own, or in
              a club with the people saving for the same thing.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-field bg-brand-700 px-7 text-base font-semibold text-white shadow-field transition-colors hover:bg-brand-800"
              >
                Start saving
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex h-12 items-center justify-center rounded-field bg-white px-7 text-base font-semibold text-brand-800 ring-1 ring-inset ring-ink-200 transition-colors hover:bg-ink-50"
              >
                I already have an account
              </Link>
            </div>

            <p className="mt-5 text-sm text-ink-500">
              Free to use. Built as a college project &mdash; please don&rsquo;t enter real bank
              details.
            </p>
          </div>

          {/* Product preview: a club card, the app's most distinctive object */}
          <div className="relative lg:pl-8">
            <div className="mx-auto max-w-sm rounded-card border border-ink-200/70 bg-white p-6 shadow-card-hover">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                    Club goal
                  </p>
                  <h3 className="mt-1 text-heading text-ink-900">Goa trip - December</h3>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-600 ring-1 ring-inset ring-ink-200">
                  <Lock aria-hidden="true" className="h-3.5 w-3.5" />
                  Locked
                </span>
              </div>

              <p className="text-money mt-6 text-ink-900">{formatPaise(6850000)}</p>
              <p className="mt-1 text-sm text-ink-500">
                of {formatPaise(12000000, { showDecimals: false })} target
              </p>

              <ProgressBar value={57} className="mt-5" />

              <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
                <AvatarGroup names={['Aarav Menon', 'Priya Nair', 'Rohan Das', 'Sneha Iyer']} />
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-700">
                  <Flame aria-hidden="true" className="h-4 w-4 text-accent-500" />
                  12 day streak
                </span>
              </div>
            </div>

            <div className="mx-auto mt-4 flex max-w-sm items-center gap-3 rounded-card border border-ink-200/70 bg-ink-50 p-4">
              <TrendingUp aria-hidden="true" className="h-5 w-5 shrink-0 text-success-600" />
              <p className="text-sm text-ink-600">
                <span className="font-semibold text-ink-900">4 members</span> saving together.
                Unlocks on 31 Dec or at target.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- Features */}
      <section className="border-t border-ink-100 bg-ink-50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <h2 className="text-title max-w-lg text-ink-900">
            Built around one rule: the money stays put.
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-card border border-ink-200/70 bg-white p-6 shadow-card"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50">
                  <Icon aria-hidden="true" className="h-5 w-5 text-brand-700" />
                </span>
                <h3 className="mt-4 font-semibold text-ink-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- How it works */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <h2 className="text-title text-ink-900">How it works</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map(({ step, title, body }) => (
              <li key={step}>
                <span className="text-sm font-bold tabular-nums text-brand-400">{step}</span>
                <h3 className="mt-2 font-semibold text-ink-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------ Final CTA */}
      <section className="px-5 pb-16 sm:px-8 sm:pb-20">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-card bg-gradient-to-br from-brand-700 to-brand-950 px-8 py-14 text-center">
          <h2 className="text-title text-white">Start with one goal.</h2>
          <p className="mx-auto mt-3 max-w-md text-brand-100">
            Name it, pick a date, and let DigiBank hold the line for you.
          </p>
          <Link
            to="/register"
            className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-field bg-white px-7 text-base font-semibold text-brand-800 transition-colors hover:bg-brand-50"
          >
            Create your account
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* --------------------------------------------------------- Footer */}
      <footer className="border-t border-ink-100 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 text-center sm:flex-row sm:justify-between sm:px-8 sm:text-left">
          <Logo size="sm" />
          <p className="text-xs text-ink-400">
            DigiBank is a student project. Not a licensed financial institution.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
