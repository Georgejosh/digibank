import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { PrivacyProvider } from '@/context/PrivacyContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppRoutes } from '@/routes/AppRoutes';

/**
 * One QueryClient for the whole app, created outside the component so a
 * re-render never throws the cache away.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Balances change when the user acts, not on their own. Refetching on
      // every window focus would mean a request every time they alt-tab.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // 4xx means the request itself was wrong; retrying just repeats it.
        // A 401 is already handled by the refresh interceptor in api.js.
        const status = error?.status ?? error?.response?.status;
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      // Never auto-retry a mutation: a retried deposit is a double deposit.
      retry: false,
    },
  },
});

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter
          // Opt in to the v7 behaviours now. Without these, React Router logs
          // two deprecation warnings into the console on every boot, and
          // adopting them early makes the eventual v7 upgrade a non-event.
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <ToastProvider>
            {/* AuthProvider needs the query client (it clears the cache on
                logout) and sits above the routes that read the session. */}
            <AuthProvider>
              <PrivacyProvider>
                <AppRoutes />
              </PrivacyProvider>
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
