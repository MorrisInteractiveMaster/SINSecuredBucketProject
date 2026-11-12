import { bucketFieldTypes, validBucketLabel, validBucketValue } from './bucket-field.mjs';
export const requestKinds = Object.freeze({ ...bucketFieldTypes,
  phone: { name: 'Phone number', max: 32, hint: 'Enter 7–15 digits, with optional +, spaces, parentheses or hyphens.' },
  file: { name: 'PDF upload', max: 10 * 1024 * 1024, hint: 'PDF only, up to 10 MiB. Files are checked before staff can open them.' },
});
export function validRequestTemplate(data) {
  return data && Object.hasOwn(requestKinds, data.type) && validBucketLabel(data.label) &&
    typeof data.instructions === 'string' && data.instructions.length <= 1000 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(data.instructions) &&
    ['active', 'archived'].includes(data.status) &&
    Number.isSafeInteger(data.maxLength) && data.maxLength > 0 && data.maxLength <= requestKinds[data.type].max &&
    (data.type !== 'sin' || data.maxLength === 24) &&
    (data.type !== 'phone' || data.maxLength >= 7);
}
export function validRequestValue(value, template) {
  if (typeof value !== 'string' || value.length > template.maxLength || template.type === 'file') return false;
  if (template.type === 'phone') return /^\+?[0-9 ()-]+$/.test(value) && /^[0-9]{7,15}$/.test(value.replace(/\D/g, ''));
  return validBucketValue(value, template.type);
}
export const requestStatusLabel = (status, type) => ({
  pending: 'Pending', submitted: 'Submitted', viewed: 'Viewed', removed: 'Retrieved / Removed',
  cancelled: 'Cancelled', quarantined: 'Checking file', rejected: 'File rejected', deleting: 'Deletion pending', deleted: 'Deleted',
}[status] ?? 'Unavailable');
