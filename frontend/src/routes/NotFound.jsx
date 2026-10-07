import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { useAuth } from '@/hooks/useAuth';

export function NotFound() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-ink-50 px-6 text-center">
      <Logo size="lg" />
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
        <Compass aria-hidden="true" className="h-7 w-7 text-brand-600" />
      </div>
      <div>
        <h1 className="text-title text-ink-900">This page does not exist</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-500">
          The link may be broken, or the page may have moved.
        </p>
      </div>
      <Link
        to={isAuthenticated ? '/app/dashboard' : '/'}
        className="inline-flex h-11 items-center justify-center rounded-field bg-brand-700 px-5 text-sm font-semibold text-white shadow-field transition-colors hover:bg-brand-800"
      >
        {isAuthenticated ? 'Back to dashboard' : 'Back to home'}
      </Link>
    </div>
  );
}

export default NotFound;
