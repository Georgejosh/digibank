import { z } from 'zod';

/**
 * Every form schema lives here so the four of us validate the same way and the
 * rules can be checked against the Django serializers in one place.
 *
 * Client-side validation is a UX convenience ONLY. The Django API re-validates
 * everything; never treat a passing check here as authorisation.
 */

// Indian mobile: 10 digits starting 6-9, optional +91 / 0 prefix.
const PHONE_RE = /^(?:\+91[- ]?|0)?[6-9]\d{9}$/;

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(128, 'That is too long')
  .regex(/[a-z]/, 'Add a lowercase letter')
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/\d/, 'Add a number');

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Enter your full name')
      .max(150, 'That is too long'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    phone: z
      .string()
      .trim()
      .regex(PHONE_RE, 'Enter a valid 10-digit Indian mobile number'),
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'Please accept the terms to continue' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  // The API accepts either an email or a phone number in this one field.
  identifier: z
    .string()
    .trim()
    .min(1, 'Enter your email or phone number')
    .refine(
      (v) => z.string().email().safeParse(v).success || PHONE_RE.test(v),
      'Enter a valid email address or 10-digit mobile number'
    ),
  password: z.string().min(1, 'Enter your password'),
  rememberMe: z.boolean().optional().default(false),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

export const otpSchema = z.object({
  code: z
    .string()
    .length(6, 'Enter all 6 digits')
    .regex(/^\d{6}$/, 'The code is 6 digits'),
});

/** Shared by "New goal" and "Create club": both write a savings_account row. */
const targetAmountRupees = z
  .number({ invalid_type_error: 'Enter an amount' })
  .positive('Enter an amount greater than zero')
  .max(10000000, 'Maximum ₹1,00,00,000 per goal');

export const savingsGoalSchema = z.object({
  goal_name: z.string().trim().min(2, 'Give this goal a name').max(150, 'That is too long'),
  target_amount_rupees: targetAmountRupees,
  deadline: z
    .string()
    .min(1, 'Pick a target date')
    .refine((v) => new Date(v) > new Date(), 'Pick a date in the future'),
});

export const clubSchema = z.object({
  name: z.string().trim().min(2, 'Give this club a name').max(150, 'That is too long'),
  goal_name: z.string().trim().min(2, 'What is the club saving for?').max(150, 'That is too long'),
  target_amount_rupees: targetAmountRupees,
  deadline: z
    .string()
    .min(1, 'Pick a deadline')
    .refine((v) => new Date(v) > new Date(), 'Pick a date in the future'),
  // Comma or newline separated list of emails to invite. Optional.
  invites: z
    .string()
    .optional()
    .refine((v) => {
      if (!v || !v.trim()) return true;
      return v
        .split(/[\s,;]+/)
        .filter(Boolean)
        .every((e) => z.string().email().safeParse(e).success);
    }, 'One of those email addresses is not valid'),
});

/**
 * Django primary keys are INTEGERS, but a <select> hands back a string and
 * setValue() writes whatever the API gave us. So an id arrives here as either
 * 1 or '1' depending on whether the user touched the control.
 *
 * z.coerce.number() normalises both. The empty 'choose one' option becomes 0
 * and fails .positive(), which is exactly the 'you must pick something' error
 * we want.
 */
const idField = (message) =>
  z.coerce.number({ invalid_type_error: message }).int(message).positive(message);

export const depositSchema = z.object({
  savings_account_id: idField('Choose where the money goes'),
  amount_rupees: z
    .number({ invalid_type_error: 'Enter an amount' })
    .positive('Enter an amount greater than zero')
    .max(200000, 'Single deposit limit is ₹2,00,000'),
});

export const withdrawalSchema = z.object({
  savings_account_id: idField('Choose a goal to withdraw from'),
  amount_rupees: z
    .number({ invalid_type_error: 'Enter an amount' })
    .min(100, 'Minimum single withdrawal is ₹100')
    .max(100000, 'Maximum single withdrawal limit is ₹1,00,000'),
});

export const walletTransactionSchema = z.object({
  amount_rupees: z
    .number({ invalid_type_error: 'Enter an amount' })
    .positive('Enter an amount greater than zero'),
  linked_bank_account_id: idField('Choose a bank account'),
});

export const emergencyRequestSchema = z.object({
  savings_account_id: idField('Choose the locked club goal'),
  amount_rupees: z
    .number({ invalid_type_error: 'Enter an amount' })
    .positive('Enter an amount greater than zero'),
  reason: z
    .string()
    .trim()
    .min(20, 'Explain the emergency in at least 20 characters - every member reads this')
    .max(500, 'Keep it under 500 characters'),
});

/** Splits the invite textarea into a clean list of emails. */
export function parseInviteEmails(value) {
  if (!value) return [];
  return value
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
