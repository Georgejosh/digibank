import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timer } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';

/** After this long without input the session locks, like a banking app. */
export const IDLE_LIMIT_MS = 10 * 60 * 1000;
const WARNING_MS = 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];

/**
 * Signs the user out after IDLE_LIMIT_MS of inactivity, with a one-minute
 * "Still there?" warning first. A money app left open on a shared lab PC is
 * the scenario this protects against.
 */
export function SessionTimeout() {
  const { logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [secondsLeft, setSecondsLeft] = useState(null);
  const lastActivity = useRef(Date.now());

  const signOut = useCallback(async () => {
    setSecondsLeft(null);
    await logout();
    toast.info('Signed out for your security', 'You were inactive for 10 minutes.');
    navigate('/login', { replace: true });
  }, [logout, navigate, toast]);

  useEffect(() => {
    const mark = () => {
      // Activity behind the warning dialog should not silently cancel it.
      if (secondsLeft === null) lastActivity.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, mark, { passive: true }));

    const timer = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_LIMIT_MS) {
        signOut();
      } else if (idle >= IDLE_LIMIT_MS - WARNING_MS) {
        setSecondsLeft(Math.ceil((IDLE_LIMIT_MS - idle) / 1000));
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, mark));
      clearInterval(timer);
    };
  }, [secondsLeft, signOut]);

  const stayIn = () => {
    lastActivity.current = Date.now();
    setSecondsLeft(null);
  };

  return (
    <Modal
      open={secondsLeft !== null}
      onClose={stayIn}
      title="Are you still there?"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={signOut}>
            Sign out
          </Button>
          <Button onClick={stayIn}>Stay signed in</Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-600">
          <Timer aria-hidden="true" className="h-5 w-5" />
        </span>
        <p className="text-sm text-ink-600">
          For your security, you will be signed out in{' '}
          <strong className="tabular-nums text-ink-900">{secondsLeft}s</strong> because there has been
          no activity.
        </p>
      </div>
    </Modal>
  );
}

export default SessionTimeout;
