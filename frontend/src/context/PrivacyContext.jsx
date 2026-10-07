import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * "Hide balances" - the eye toggle every banking app has, for checking the app
 * on a bus or sharing a screen in class.
 *
 * Purely cosmetic and per-device, so localStorage is the right home. Every read
 * and write is wrapped: storage throws in private windows and when site data
 * is blocked, and a hidden-balance preference is not worth crashing over.
 */
const STORAGE_KEY = 'digibank.hideBalances';
const PrivacyContext = createContext({ hidden: false, toggle: () => {} });

function readInitial() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function PrivacyProvider({ children }) {
  const [hidden, setHidden] = useState(readInitial);

  const toggle = useCallback(() => {
    setHidden((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Preference just will not survive a reload.
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
