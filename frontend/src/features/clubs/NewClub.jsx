import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, KeyRound, Mail, Users } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, MoneyInput, Textarea } from '@/components/ui/Input';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmergencyInfoCard } from './EmergencyInfoCard';
import { useCreateClub } from '@/hooks/useClubs';
import { clubSchema, parseInviteEmails } from '@/utils/validation';
import { rupeesToPaise } from '@/utils/money';
import { todayISO } from '@/utils/date';

/**
 * POST /api/clubs/
 *
 * Django creates three rows in one transaction: the `groups` row, the
 * creator's `group_members` row, and the GROUP `savings_accounts` row that
 * actually holds the pooled balance.
 */
export function NewClub() {
  const navigate = useNavigate();
  const createClub = useCreateClub();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(clubSchema),
    mode: 'onTouched',
    defaultValues: {
      name: '',
      goal_name: '',
      target_amount_rupees: undefined,
      deadline: '',
      invites: '',
      split_equally: false,
    },
  });

  const inviteCount = parseInviteEmails(watch('invites')).length;

  const onSubmit = async (values) => {
    try {
      const club = await createClub.mutateAsync({
        name: values.name,
        goal_name: values.goal_name,
        target_amount_paise: rupeesToPaise(values.target_amount_rupees),
        deadline: values.deadline,
        // Each address gets an invite in their DigiBank account plus an email;
        // nobody becomes a member until they accept it themselves.
        invites: parseInviteEmails(values.invites),
        split_equally: Boolean(values.split_equally),
      });
      navigate(club?.id ? `/app/clubs/${club.id}` : '/app/clubs');
    } catch {
      // Surfaced by the toast in useCreateClub.
    }
  };

  return (
    <div className="animate-fade-in">
      <Link
        to="/app/clubs"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to clubs
      </Link>

      <PageHeader
        title="Create a club"
        description="Pool savings with other people towards one shared target."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
              <Input
                label="Club name"
                placeholder="Beach Squad"
                required
                hint="What the group is called - members will see this."
                error={errors.name?.message}
                {...register('name')}
              />

              <Input
                label="What is the club saving for?"
                placeholder="Goa trip - December"
                required
                error={errors.goal_name?.message}
                {...register('goal_name')}
              />

              <MoneyInput
                label="Combined target amount"
                placeholder="120000"
                required
                hint="The total the whole club is saving towards, not per person."
                error={errors.target_amount_rupees?.message}
                {...register('target_amount_rupees', { valueAsNumber: true })}
              />

              <Input
                label="Deadline"
                type="date"
                required
                min={todayISO()}
                hint="Funds unlock on this date even if the target is not met."
                error={errors.deadline?.message}
                {...register('deadline')}
              />

              <Textarea
                label="Invite members by email"
                placeholder={'priya@example.com\nrohan@example.com'}
                rows={3}
                hint={
                  inviteCount > 0
                    ? `${inviteCount} address${inviteCount === 1 ? '' : 'es'} - each gets an invite in DigiBank and by email.`
                    : 'Optional. One email per line, or separated by commas. You also get a club code to share.'
                }
                error={errors.invites?.message}
                {...register('invites')}
              />

              <Checkbox
                label="Split the target equally - every member pays the same share before the deadline (you can change this later)"
                {...register('split_equally')}
              />

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
                <Link
                  to="/app/clubs"
                  className="inline-flex h-11 items-center justify-center rounded-field bg-white px-5 text-sm font-semibold text-ink-700 ring-1 ring-inset ring-ink-200 transition-colors hover:bg-ink-50"
                >
                  Cancel
                </Link>
                <Button type="submit" size="md" isLoading={createClub.isPending}>
                  {createClub.isPending ? 'Creating...' : 'Create club'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <aside className="space-y-4">
          <Card className="border-ink-200 bg-ink-50">
            <CardBody>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <Users aria-hidden="true" className="h-4 w-4 text-ink-500" />
                You become the creator
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                As creator you can invite members, but you get no special power over the money.
                Every member&rsquo;s approval counts exactly the same.
              </p>
            </CardBody>
          </Card>

          <Card className="border-brand-200 bg-brand-50/60">
            <CardBody>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-900">
                <Mail aria-hidden="true" className="h-4 w-4 text-brand-600" />
                Two ways to bring people in
              </h2>
              <ul className="mt-2 space-y-2 text-sm leading-relaxed text-brand-800">
                <li>
                  <strong>Invite by email.</strong> The invite lands in their DigiBank account (and their inbox);
                  they accept it themselves. No account yet? They are asked to sign up with that email.
                </li>
                <li className="flex gap-1.5">
                  <KeyRound aria-hidden="true" className="mt-1 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong>Share the club code.</strong> Anyone with it can ask to join - you accept or decline.
                  </span>
                </li>
              </ul>
            </CardBody>
          </Card>

          <EmergencyInfoCard />
        </aside>
      </div>
    </div>
  );
}

export default NewClub;
