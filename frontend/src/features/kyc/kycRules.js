/**
 * Client-side mirrors of the checks in backend/apps/accounts/kyc.py. They give
 * instant feedback only - the server re-runs every one of them.
 */

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const PINCODE_RE = /^[1-9][0-9]{5}$/;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 7, 8, 6, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** Verhoeff checksum - the 12th Aadhaar digit. */
export function aadhaarIsValid(value) {
  const n = String(value ?? '').replace(/\s/g, '');
  if (!/^[2-9][0-9]{11}$/.test(n)) return false;
  let c = 0;
  [...n].reverse().forEach((digit, i) => {
    c = D[c][P[i % 8][Number(digit)]];
  });
  return c === 0;
}

export function ageFrom(dob) {
  if (!dob) return 0;
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age -= 1;
  return age;
}

export function panError(pan) {
  if (!PAN_RE.test(pan)) return 'PAN must look like ABCDE1234F';
  if (pan[3] !== 'P') return 'Use your personal PAN (the 4th letter is P)';
  return null;
}

export function fileError(file, { imagesOnly = false } = {}) {
  if (!file) return 'Required';
  if (file.size > MAX_UPLOAD_BYTES) return 'Must be under 5 MB';
  const ok = imagesOnly
    ? /^image\/(jpeg|png|webp)$/.test(file.type)
    : /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type);
  return ok ? null : imagesOnly ? 'Use a JPG, PNG or WEBP image' : 'Use a JPG, PNG, WEBP or PDF';
}

export const OCCUPATIONS = [
  ['STUDENT', 'Student'],
  ['SALARIED', 'Salaried'],
  ['SELF_EMPLOYED', 'Self-employed'],
  ['HOMEMAKER', 'Homemaker'],
  ['RETIRED', 'Retired'],
  ['OTHER', 'Other'],
];

export const ADDRESS_PROOFS = [
  ['AADHAAR', 'Aadhaar card'],
  ['PASSPORT', 'Passport'],
  ['VOTER_ID', 'Voter ID'],
  ['DRIVING_LICENCE', 'Driving licence'],
];

export const STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
];
