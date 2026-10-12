import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import api from './api';
import { ENDPOINTS } from './endpoints';

/**
 * Face / fingerprint via WebAuthn.
 *
 * The browser asks the operating system (Windows Hello, Face ID, Touch ID,
 * Android biometrics) to scan the user. We never see the face or fingerprint;
 * we only receive a signature the device produces after a successful scan,
 * and Django verifies it. See backend/apps/accounts/biometrics.py.
 */

/** Can this browser + device do built-in face/fingerprint at all? */
export async function biometricSupport() {
  // Passkeys only exist on https:// (or localhost). A phone opening the site
  // through a LAN address like http://192.168.x.x is NOT a secure context.
  const secure = typeof window !== 'undefined' && window.isSecureContext;
  if (!secure || !browserSupportsWebAuthn()) return { supported: false, platform: false, secure };
  let platform = false;
  try {
    platform = await platformAuthenticatorIsAvailable();
  } catch {
    platform = false;
  }
  // `platform` is only a hint: several mobile browsers report false even when
  // the phone has a fingerprint sensor, so it must never hide the setup button.
  return { supported: true, platform, secure };
}

/** Turns WebAuthn browser errors into something a person can act on. */
export function friendlyBiometricError(error) {
  // Server errors (axios, normalised in api.js) already carry a readable message.
  if (error?.status) return error.message;
  const name = error?.name ?? error?.cause?.name;
  const code = error?.code;
  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' || name === 'InvalidStateError') {
    return 'This device is already set up for DigiBank.';
  }
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return 'The scan was cancelled, timed out, or no face / fingerprint is set up on this device. Make sure a screen lock with fingerprint or face is enabled, then try again.';
  }
  if (name === 'ConstraintError' || code === 'ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT') {
    return 'This device cannot verify you. Turn on a screen lock with fingerprint, face or PIN in your phone / Windows settings first.';
  }
  if (name === 'SecurityError') {
    return 'Biometrics only work on the secure site (https://digibank-eta.vercel.app), not on an http:// or IP address.';
  }
  if (name === 'NotSupportedError') return 'This browser cannot create a passkey. Try Chrome, Edge or Safari.';
  return error?.message || 'Biometric check failed. Please try again.';
}

export async function enrolDevice(deviceName) {
  const { data } = await api.post(ENDPOINTS.biometric.registerOptions);
  const credential = await startRegistration({ optionsJSON: data.options });
  const { data: device } = await api.post(ENDPOINTS.biometric.registerVerify, {
    challenge_id: data.challenge_id,
    credential,
    device_name: deviceName,
  });
  return device;
}

/** Passwordless sign-in. Returns { access_token, user } like verify-otp. */
export async function signInWithBiometrics(identifier) {
  const { data } = await api.post(ENDPOINTS.biometric.loginOptions, {
    identifier: identifier || undefined,
  });
  const credential = await startAuthentication({ optionsJSON: data.options });
  const { data: session } = await api.post(ENDPOINTS.biometric.loginVerify, {
    challenge_id: data.challenge_id,
    credential,
  });
  return session;
}

/** Scan to approve a withdrawal. Returns a single-use biometric_token. */
export async function approveWithBiometrics() {
  const { data } = await api.post(ENDPOINTS.biometric.approveOptions);
  const credential = await startAuthentication({ optionsJSON: data.options });
  const { data: approval } = await api.post(ENDPOINTS.biometric.approveVerify, {
    challenge_id: data.challenge_id,
    credential,
  });
  return approval.biometric_token;
}

export async function listDevices() {
  const { data } = await api.get(ENDPOINTS.biometric.credentials);
  return data;
}

export async function removeDevice(id, biometricToken) {
  await api.delete(ENDPOINTS.biometric.credential(id), {
    data: biometricToken ? { biometric_token: biometricToken } : undefined,
  });
}

export async function setWithdrawalProtection(enabled, biometricToken) {
  const { data } = await api.post(ENDPOINTS.biometric.settings, {
    require_biometric_for_withdrawals: enabled,
    biometric_token: biometricToken,
  });
  return data;
}
