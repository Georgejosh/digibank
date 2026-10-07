import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Info, Lock } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, MoneyInput } from '@/components/ui/Input';
import { PageHeader } from '@/components/layout/PageHeader';
import { useCreateSavingsGoal } from '@/hooks/useSavingsGoals';
import { savingsGoalSchema } from '@/utils/validation';
import { rupeesToPaise } from '@/utils/money';
import { todayISO } from '@/utils/date';

const QUICK_AMOUNTS = [5000, 10000, 25000, 50000];

/** POST /api/savings/individual/ */
export function NewSavingsGoal() {
  const navigate = useNavigate();
  const createGoal = useCreateSavingsGoal();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(savingsGoalSchema),
    mode: 'onTouched',
    defaultValues: { goal_name: '', target_amount_rupees: undefined, deadline: '' },
  });

  const amount = watch('target_amount_rupees');

  const onSubmit = async (values) => {
    try {
      await createGoal.mutateAsync({
        goal_name: values.goal_name,
        // The API speaks paise. Convert at the boundary, never mid-component.
        target_amount_paise: rupeesToPaise(values.target_amount_rupees),
        deadline: values.deadline,
      });
      navigate('/app/savings');
    } catch {
      // The toast in useCreateSavingsGoal surfaces the failure.
    }
  };

  return (
    <div className="animate-fade-in">
      <Link
        to="/app/savings"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to goals
      </Link>

      <PageHeader
        title="Create a savings goal"
        description="Set the amount and the date. Your money is locked until one of them is reached."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
              <Input
                label="What are you saving for?"
                placeholder="New laptop"
                required
                error={errors.goal_name?.message}
                {...register('goal_name')}
              />

              <div>
                <MoneyInput
                  label="Target amount"
                  placeholder="50000"
                  required
                  error={errors.target_amount_rupees?.message}
                  {...register('target_amount_rupees', { valueAsNumber: true })}
                />
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {QUICK_AMOUNTS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setValue('target_amount_rupees', value, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      }
                      className={
                        Number(amount) === value
                          ? 'rounded-full bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white'
                          : 'rounded-full bg-ink-100 px-3 py-1.5 text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-200'
                      }
                    >
                      ₹{value.toLocaleString('en-IN')}
                    </button>
                  ))}
                </div>
              </div>

              <Input
                label="Target date"
                type="date"
                required
                min={todayISO()}
                hint="Funds unlock on this date even if the target is not met."
                error={errors.deadline?.message}
                {...register('deadline')}
              />

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
                <Link
                  to="/app/savings"
                  className="inline-flex h-11 items-center justify-center rounded-field bg-white px-5 text-sm font-semibold text-ink-700 ring-1 ring-inset ring-ink-200 transition-colors hover:bg-ink-50"
                >
                  Cancel
                </Link>
                <Button type="submit" size="md" isLoading={createGoal.isPending}>
                  {createGoal.isPending ? 'Creating...' : 'Create goal'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        {/* Set expectations before they commit money, not after */}
        <aside className="space-y-4">
          <Card className="border-ink-200 bg-ink-50">
            <CardBody>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <Lock aria-hidden="true" className="h-4 w-4 text-ink-500" />
                How the lock works
              </h2>
              <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-600">
                <li>Deposits are held until the target amount is reached.</li>
                <li>Or until the target date arrives, whichever comes first.</li>
                <li>You can always add more, from any linked bank account.</li>
              </ul>
            </CardBody>
          </Card>

          <Card className="border-brand-200 bg-brand-50/60">
            <CardBody>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-900">
                <Info aria-hidden="true" className="h-4 w-4 text-brand-600" />
                Individual, not a club
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-brand-800">
                This goal is yours alone, so no approvals are needed. To save with other people,
                create a club instead.
              </p>
              <Link
                to="/app/clubs/new"
                className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:text-brand-800"
              >
                Create a club instead
              </Link>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default NewSavingsGoal;
