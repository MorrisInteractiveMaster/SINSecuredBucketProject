export const defaultBucketField = Object.freeze({
  label: 'Social Insurance Number', type: 'sin', revision: 'initial',
});
export const bucketFieldTypes = {
  sin: { name: 'Canadian SIN', max: 24, hint: 'Enter a valid nine-digit Canadian SIN.' },
  account: { name: 'Account number', max: 64, hint: 'Use 1–64 letters, digits, spaces, or hyphens.' },
  code: { name: 'Access code', max: 128, hint: 'Use 1–128 printable characters without spaces.' },
  text: { name: 'Confidential text', max: 1024, hint: 'Enter up to 1,024 characters of text.' },
};
export function validBucketLabel(label) {
  return typeof label === 'string' && label.trim().length > 0 && label.trim().length <= 80 &&
    !/[\p{Cc}\p{Cf}]/u.test(label);
}
export function validBucketValue(value, type) {
  if (typeof value !== 'string' || !Object.hasOwn(bucketFieldTypes, type) ||
      !value.trim() || value.length > bucketFieldTypes[type].max) return false;
  if (type === 'account') return /^[a-z0-9][a-z0-9 -]*$/i.test(value);
  if (type === 'code') return /^[!-~]+$/.test(value);
  if (type === 'text') return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value);
  return true; // SIN checksum is checked by the existing validator.
}
