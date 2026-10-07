/**
 * The Django REST API contract. Single source of truth for URLs so a backend
 * rename is one edit here, not a grep across the app.
 *
 * Paths are relative to VITE_API_BASE_URL (e.g. http://127.0.0.1:8000/api).
 */
export const ENDPOINTS = {
  auth: {
    register: '/auth/register/',
    login: '/auth/login/',
    refresh: '/auth/refresh/',
    logout: '/auth/logout/',
    verifyOtp: '/auth/verify-otp/',
    resendOtp: '/auth/resend-otp/',
    forgotPassword: '/auth/forgot-password/',
    me: '/auth/me/',
  },
  biometric: {
    registerOptions: '/auth/biometric/register/options/',
    registerVerify: '/auth/biometric/register/verify/',
    loginOptions: '/auth/biometric/login/options/',
    loginVerify: '/auth/biometric/login/verify/',
    approveOptions: '/auth/biometric/approve/options/',
    approveVerify: '/auth/biometric/approve/verify/',
    credentials: '/auth/biometric/credentials/',
    credential: (id) => `/auth/biometric/credentials/${id}/`,
    settings: '/auth/biometric/settings/',
  },
  savings: {
    individual: '/savings/individual/',
    depositTargets: '/savings/deposit-targets/',
    withdrawalTargets: '/savings/withdrawal-targets/',
    detail: (id) => `/savings/individual/${id}/`,
  },
  clubs: {
    list: '/clubs/',
    detail: (id) => `/clubs/${id}/`,
    invite: (id) => `/clubs/${id}/invite/`,
  },
  deposits: {
    create: '/payments/deposits/',
    bankAccounts: '/accounts/bank-accounts/',
  },
  banks: {
    list: '/accounts/bank-accounts/',
    detail: (id) => `/accounts/bank-accounts/${id}/`,
    primary: (id) => `/accounts/bank-accounts/${id}/primary/`,
    ifsc: (code) => `/accounts/ifsc/${encodeURIComponent(code)}/`,
  },
  kyc: {
    status: '/kyc/',
    submit: '/kyc/submit/',
  },
  withdrawals: {
    create: '/payments/withdrawals/',
  },
  wallet: {
    deposit: '/payments/wallet/deposit/',
    withdraw: '/payments/wallet/withdraw/',
    transactions: '/payments/wallet/transactions/',
    config: '/payments/config/',
    topupOrder: '/payments/wallet/topup/order/',
    topupVerify: '/payments/wallet/topup/verify/',
  },
  emergency: {
    list: '/emergency/requests/',
    create: '/emergency/requests/',
    approve: (id) => `/emergency/requests/${id}/approve/`,
    reject: (id) => `/emergency/requests/${id}/reject/`,
  },
  transactions: {
    list: '/transactions/',
  },
  notifications: {
    list: '/notifications/',
    markRead: (id) => `/notifications/${id}/read/`,
    markAllRead: '/notifications/read-all/',
  },
  dashboard: {
    summary: '/dashboard/summary/',
  },
};
