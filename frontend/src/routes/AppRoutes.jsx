import { lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AuthLayout } from '@/components/layout/AuthLayout';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicOnlyRoute } from './PublicOnlyRoute';
import { NotFound } from './NotFound';

/* -------------------------------------------------------------------- *
 * EAGER: the public entry points.
 *
 * Landing and the auth screens are the first thing a new user sees, so they
 * ship in the main bundle - a code-split chunk here would only add a network
 * round trip to the moment that matters most for a first impression.
 * -------------------------------------------------------------------- */
import Landing from '@/features/landing/Landing';
import Login from '@/features/auth/Login';
import Register from '@/features/auth/Register';
import ForgotPassword from '@/features/auth/ForgotPassword';
import VerifyOtp from '@/features/auth/VerifyOtp';

/* -------------------------------------------------------------------- *
 * LAZY: everything behind the login wall.
 *
 * A logged-out visitor never downloads the dashboard, clubs or ledger code.
 * Each of these becomes its own chunk, fetched on first navigation and cached
 * by the service worker afterwards. The <Suspense> that catches them lives in
 * DashboardLayout, so the chrome stays painted while a chunk loads.
 * -------------------------------------------------------------------- */
const Dashboard = lazy(() => import('@/features/dashboard/Dashboard'));
const SavingsGoals = lazy(() => import('@/features/savings/SavingsGoals'));
const NewSavingsGoal = lazy(() => import('@/features/savings/NewSavingsGoal'));
const Clubs = lazy(() => import('@/features/clubs/Clubs'));
const NewClub = lazy(() => import('@/features/clubs/NewClub'));
const DigiLocker = lazy(() => import('@/features/digilocker/DigiLocker'));
const Emergency = lazy(() => import('@/features/emergency/Emergency'));
const Transactions = lazy(() => import('@/features/transactions/Transactions'));
const Notifications = lazy(() => import('@/features/notifications/Notifications'));
const Wallet = lazy(() => import('@/features/wallet/Wallet'));
const Kyc = lazy(() => import('@/features/kyc/Kyc'));
const Profile = lazy(() => import('@/features/profile/Profile'));
const Help = lazy(() => import('@/features/help/Help'));

/**
 * Deposit and Withdraw used to be two screens; they are now the two modes of
 * DigiLocker. Old links (and any preselected goal in router state) still work.
 */
function ToDigiLocker({ mode }) {
  const location = useLocation();
  return <Navigate to={`/app/digilocker?mode=${mode}`} state={location.state} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public marketing page */}
      <Route path="/" element={<Landing />} />

      {/* Auth screens - redirect to the dashboard if already signed in */}
      <Route element={<PublicOnlyRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify-otp" element={<VerifyOtp />} />
        </Route>
      </Route>

      {/* Everything below requires a session */}
      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<DashboardLayout />}>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="savings" element={<SavingsGoals />} />
          <Route path="savings/new" element={<NewSavingsGoal />} />
          <Route path="clubs" element={<Clubs />} />
          <Route path="clubs/new" element={<NewClub />} />
          <Route path="digilocker" element={<DigiLocker />} />
          <Route path="deposit" element={<ToDigiLocker mode="deposit" />} />
          <Route path="withdraw" element={<ToDigiLocker mode="withdraw" />} />
          <Route path="emergency" element={<Emergency />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="kyc" element={<Kyc />} />
          <Route path="lockers" element={<Navigate to="/app/digilocker" replace />} />
          <Route path="profile" element={<Profile />} />
          <Route path="help" element={<Help />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;
