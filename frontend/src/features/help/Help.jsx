import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Headset, Mail, Search, ShieldAlert } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/layout/PageHeader';
import { cn } from '@/utils/cn';

const FAQS = [
  {
    topic: 'DigiLocker',
    q: 'What is DigiLocker?',
    a: 'DigiLocker is where your savings live. Each goal and club is a compartment. Deposit moves money from your wallet into a compartment; Withdraw moves unlocked money back to your wallet.',
  },
  {
    topic: 'DigiLocker',
    q: 'Why can’t I withdraw from my goal?',
    a: 'A goal stays locked until you reach its target amount or its deadline passes. That is the whole idea - it stops impulse spending. Once either happens, the compartment unlocks and Withdraw becomes available.',
  },
  {
    topic: 'DigiLocker',
    q: 'Where does withdrawn money go?',
    a: 'Always to your Digital Wallet first. From the wallet you can lock it again, or send it to your linked bank account.',
  },
  {
    topic: 'Wallet',
    q: 'How do I add money?',
    a: 'Open Wallet, choose Add money, enter an amount and confirm. In this version bank transfers are simulated - never enter real bank or card details.',
  },
  {
    topic: 'Wallet',
    q: 'Can I download a statement?',
    a: 'Yes. The Wallet page and the Statements page both have a CSV download you can open in Excel or Google Sheets. Every transfer also has a receipt you can print or save as PDF.',
  },
  {
    topic: 'Clubs',
    q: 'How do I get money out of a club early?',
    a: 'Raise an emergency request from the Emergency page. The money is released only when every member of the club approves.',
  },
  {
    topic: 'Security',
    q: 'Why was I signed out?',
    a: 'For your safety DigiBank signs you out after 10 minutes without activity. Sign in again with your password and the one-time code.',
  },
  {
    topic: 'Security',
    q: 'Someone asked for my OTP. What should I do?',
    a: 'Never share it. DigiBank staff will never ask for your OTP or password. Change your password and contact support if you think someone has it.',
  },
];

/** Help & Support: FAQs with search, plus how to reach the team. */
export function Help() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(FAQS[0].q);
  const q = query.trim().toLowerCase();
  const results = FAQS.filter((f) => !q || `${f.q} ${f.a} ${f.topic}`.toLowerCase().includes(q));

  return (
    <div className="animate-fade-in">
      <PageHeader title="Help & Support" description="Answers to common questions about saving with DigiBank." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <Input
            leftIcon={Search}
            placeholder="Search help articles"
            aria-label="Search help articles"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Card className="mt-4">
            {results.length ? (
              <ul className="divide-y divide-ink-100">
                {results.map((f) => {
                  const expanded = open === f.q;
                  return (
                    <li key={f.q}>
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : f.q)}
                        aria-expanded={expanded}
                        className="flex w-full items-center gap-3 px-5 py-4 text-left"
                      >
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                          {f.topic}
                        </span>
                        <span className="flex-1 text-sm font-semibold text-ink-900">{f.q}</span>
                        <ChevronDown
                          aria-hidden="true"
                          className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform', expanded && 'rotate-180')}
                        />
                      </button>
                      {expanded && <p className="px-5 pb-4 text-sm leading-relaxed text-ink-600">{f.a}</p>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <CardBody className="py-10 text-center text-sm text-ink-500">
                No articles match “{query}”.
              </CardBody>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardBody>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <Headset aria-hidden="true" className="h-4 w-4 text-brand-600" />
                Contact support
              </h2>
              <p className="mt-2 text-sm text-ink-600">
                Can’t find what you need? Reach the DigiBank team and include the reference number
                from your receipt.
              </p>
              <a
                href="mailto:support@digibank.example"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
              >
                <Mail aria-hidden="true" className="h-4 w-4" /> support@digibank.example
              </a>
            </CardBody>
          </Card>
          <Card className="border-danger-100 bg-danger-50/50">
            <CardBody>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-danger-700">
                <ShieldAlert aria-hidden="true" className="h-4 w-4" />
                Stay safe
              </h2>
              <p className="mt-2 text-sm text-ink-700">
                DigiBank will never call, text or email you asking for your password or OTP.
              </p>
              <Link to="/app/profile" className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:text-brand-800">
                Review security settings
              </Link>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default Help;
