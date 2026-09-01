import { patientLinkUrl, signedToken, verifySignedToken } from '@/lib/signed-links';

/**
 * Self-confirmation links: the patient taps a link in their reminder and tells
 * the clinic whether they are coming, without an account or a password.
 *
 * The token is an HMAC of the appointment id rather than a stored secret, so
 * there is no table to leak and no cleanup to forget. It grants exactly two
 * actions on exactly one appointment — confirm or decline — and the page behind
 * it shows a first name and a time, never a medical record.
 *
 * The signing itself moved to `signed-links.ts` when the opt-out link needed
 * the same machinery. What is signed did not change by one byte: the message is
 * still `<purpose>:<appointmentId>` and the purpose string is still the one
 * below, because every confirmation link this practice has ever sent is sitting
 * in somebody's WhatsApp history and must keep working.
 */

/** Distinct from the session key, so one purpose can never sign for the other. */
const PURPOSE = 'appointment-confirmation:v1';

/** `<appointmentId>~<mac>` — the whole path segment the patient receives. */
export async function confirmationToken(appointmentId: string): Promise<string> {
  return signedToken(PURPOSE, appointmentId);
}

/** Returns the appointment id only when the signature matches. */
export async function verifyConfirmationToken(token: string): Promise<string | null> {
  return verifySignedToken(PURPOSE, token);
}

/**
 * The absolute link to put in a message. Falls back to localhost in development;
 * set `NEXT_PUBLIC_APP_URL` so the patient receives a link that actually resolves.
 */
export function confirmationUrl(locale: string, token: string): string {
  return patientLinkUrl(locale, 'confirm', token);
}
