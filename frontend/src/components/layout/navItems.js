import {
  BadgeCheck,
  Bell,
  CircleHelp,
  LayoutDashboard,
  PiggyBank,
  Receipt,
  ShieldAlert,
  UserRound,
  Users,
  Vault,
  Wallet,
} from 'lucide-react';

/**
 * One nav definition, rendered by both the desktop Sidebar and the mobile
 * BottomNav, so the two can never drift apart.
 *
 * `section` groups the sidebar. `primary: true` marks the five destinations
 * that fit in the thumb bar on a phone; the rest are sidebar/drawer only.
 */
export const NAV_SECTIONS = ['Overview', 'Save', 'Activity', 'Account'];

export const NAV_ITEMS = [
  { to: '/app/dashboard', label: 'Home', icon: LayoutDashboard, primary: true, section: 'Overview' },
  { to: '/app/wallet', label: 'Wallet', icon: Wallet, primary: true, section: 'Overview' },
  { to: '/app/digilocker', label: 'DigiLocker', icon: Vault, primary: true, section: 'Overview' },
  { to: '/app/savings', label: 'Goals', icon: PiggyBank, primary: true, section: 'Save' },
  { to: '/app/clubs', label: 'Clubs', icon: Users, primary: true, section: 'Save' },
  { to: '/app/transactions', label: 'Statements', icon: Receipt, primary: false, section: 'Activity' },
  { to: '/app/emergency', label: 'Emergency', icon: ShieldAlert, primary: false, section: 'Activity' },
  { to: '/app/notifications', label: 'Notifications', icon: Bell, primary: false, section: 'Activity' },
  { to: '/app/kyc', label: 'KYC Verification', icon: BadgeCheck, primary: false, section: 'Account' },
  { to: '/app/profile', label: 'Profile & Security', icon: UserRound, primary: false, section: 'Account' },
  { to: '/app/help', label: 'Help & Support', icon: CircleHelp, primary: false, section: 'Account' },
];
