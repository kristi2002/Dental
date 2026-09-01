import { patientLinkUrl, signedToken, verifySignedToken } from '@/lib/signed-links';

/**
 * The line at the bottom of the message that lets a patient stop receiving
 * them.
 *
 * `contactConsent` has been on the patient record from the beginning, tri-state
 * and carefully honoured by every queue and every button — and until now the
 * only hand that could move it was a member of staff's. A patient who wanted to
 * be left alone had to ring the practice and ask somebody to tick a box on
 * their behalf, which is not consent management, it is a favour.
 *
 * Two reasons it is worth building rather than filing under good manners:
 *
 *  - **The lawful basis.** Messaging patients in the EU about anything they did
 *    not specifically ask for needs a recorded basis and a way out of it. A
 *    box only the practice can tick is not a way out.
 *  - **Deliverability.** The alternative to an unsubscribe link is the button
 *    every mail client puts next to it, which is "this is junk" — and one
 *    complaint costs the practice's sending domain more than a hundred
 *    unsubscribes do. See `events.ts`, which now hears about both.
 *
 * The same signed-link machinery as the confirmation link, under a purpose of
 * its own so that a token issued to say "yes, I am coming" cannot also say
 * "never write to me again". It carries a patient id rather than an
 * appointment's, and it never expires: a link that stops working is a patient
 * who cannot opt out, which is precisely the state this exists to end.
 */

const PURPOSE = 'contact-opt-out:v1';

export async function optOutToken(patientId: string): Promise<string> {
  return signedToken(PURPOSE, patientId);
}

export async function verifyOptOutToken(token: string): Promise<string | null> {
  return verifySignedToken(PURPOSE, token);
}

export function optOutUrl(locale: string, token: string): string {
  return patientLinkUrl(locale, 'unsubscribe', token);
}
