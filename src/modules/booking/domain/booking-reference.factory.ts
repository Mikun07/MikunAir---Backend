// Generates collision-resistant 6-character alphanumeric booking references
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // removed I, O, 0, 1 — visually ambiguous

export function generateBookingReference(): string {
  let ref = '';
  for (let i = 0; i < 6; i++) {
    ref += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return ref;
}
