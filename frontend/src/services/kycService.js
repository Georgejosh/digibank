import api from './api';
import { ENDPOINTS } from './endpoints';

/** KYC, bank linking and gateway top-ups. */

export async function getKyc() {
  const { data } = await api.get(ENDPOINTS.kyc.status);
  return data;
}

/** `form` is a FormData with the text fields plus pan_document, address_document, selfie. */
export async function submitKyc(form) {
  const { data } = await api.post(ENDPOINTS.kyc.submit, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60_000,
  });
  return data;
}

export async function lookupIfsc(code) {
  const { data } = await api.get(ENDPOINTS.banks.ifsc(code));
  return data;
}

export async function addBankAccount(payload) {
  const { data } = await api.post(ENDPOINTS.banks.list, payload);
  return data;
}

export async function removeBankAccount(id) {
  await api.delete(ENDPOINTS.banks.detail(id));
}

export async function makePrimaryBankAccount(id) {
  const { data } = await api.post(ENDPOINTS.banks.primary(id));
  return data;
}

export async function getPaymentsConfig() {
  const { data } = await api.get(ENDPOINTS.wallet.config);
  return data;
}

export async function createTopupOrder(payload) {
  const { data } = await api.post(ENDPOINTS.wallet.topupOrder, payload);
  return data;
}

export async function verifyTopup(payload) {
  const { data } = await api.post(ENDPOINTS.wallet.topupVerify, payload);
  return data;
}

/** Loads Razorpay Checkout once, on first use. */
let checkoutPromise;
export function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!checkoutPromise) {
    checkoutPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(window.Razorpay);
      script.onerror = () => {
        checkoutPromise = undefined;
        reject(new Error('Could not load the payment page. Check your connection.'));
      };
      document.body.appendChild(script);
    });
  }
  return checkoutPromise;
}

/**
 * Opens Razorpay Checkout for a server-created order and resolves with the
 * three values the server needs to verify the payment. Rejects with
 * `cancelled: true` if the user closes the window.
 */
export async function payWithRazorpay(order) {
  const Razorpay = await loadRazorpayCheckout();
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount_paise,
      currency: order.currency,
      name: 'DigiBank',
      description: 'Add money to wallet',
      prefill: {
        ...order.prefill,
        ...(order.bank_code ? { method: 'netbanking', bank: order.bank_code } : {}),
      },
      theme: { color: '#145F65' },
      handler: (response) => resolve(response),
      modal: {
        ondismiss: () => {
          const error = new Error('Payment cancelled.');
          error.cancelled = true;
          reject(error);
        },
      },
    });
    rzp.on('payment.failed', (response) => {
      reject(new Error(response?.error?.description || 'Payment failed.'));
    });
    rzp.open();
  });
}
