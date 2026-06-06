// PII field names that must never appear in log output (GDPR + Security Rule)
const PII_FIELDS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'fullName',
  'full_name',
  'dateOfBirth',
  'date_of_birth',
  'documentNumber',
  'document_number',
  'documentType',
  'document_type',
  'email',
  'name',
  'dob',
]);

type LogPayload = Record<string, unknown>;

export function sanitise(obj: LogPayload): LogPayload {
  const result: LogPayload = {};

  for (const [key, value] of Object.entries(obj)) {
    if (PII_FIELDS.has(key)) {
      result[key] = '[REDACTED]';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitise(value as LogPayload);
    } else {
      result[key] = value;
    }
  }

  return result;
}
