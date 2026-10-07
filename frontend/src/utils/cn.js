import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class names, letting later classes win over earlier ones.
 * `cn('p-2', condition && 'p-4')` -> 'p-4' rather than both fighting.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
