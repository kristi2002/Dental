/**
 * Reminders are deliberately "link only": we never send anything on the
 * dentist's behalf. Each helper builds a pre-filled `wa.me` / `mailto:` URL that
 * opens WhatsApp or the mail client with the message ready to review and send.
 */

/**
 * The dialling code to assume for a number written without one.
 *
 * The practice is in Vlorë and most of its numbers are Albanian, so `355` was
 * hard-coded — and that is right for the patient who says "zero six nine…" and
 * wrong for the one this application has a whole page addressed to. An Italian
 * mobile is written `340 1234567`: no `+`, and no trunk zero to strip, so it
 * fell through to "prepend the default" and became `3553401234567`. The message
 * then went nowhere, silently, and the practice had no way to know — which is
 * the worst shape a failed reminder can take.
 *
 * Keyed on the *patient's* language, which is the only thing the record knows
 * about where somebody is. It is a guess and it is stated as one: a patient
 * reading in Italian is far likelier to hold an Italian number than an Albanian
 * one, and until this the app made the opposite guess for everybody. Somebody
 * whose number is a third country's writes it with a `+`, which every branch
 * below already honours untouched.
 *
 * `en` deliberately maps to the practice's own country rather than to a guess:
 * English is the language a Dutch, German or British patient will pick, and
 * there is no country behind it to infer. That is exactly the old behaviour, so
 * nothing that worked before changes.
 */
const DIALLING_CODES: Record<string, string> = {
  sq: '355',
  it: '39',
  en: '355',
};

/** The practice's own country, for a number with nothing at all to go on. */
const DEFAULT_DIALLING_CODE = '355';

export function diallingCodeFor(locale: string | null | undefined): string {
  return (locale && DIALLING_CODES[locale]) || DEFAULT_DIALLING_CODE;
}

/**
 * `wa.me` needs a bare international number: digits only, no `+`, no spaces.
 * Albanian numbers are commonly written as `069 12 34 567` or `+355 69 …`, so we
 * normalise a local `0`-prefixed number to the country code when one is given.
 *
 * `defaultCountryCode` is what a number with no country code of its own is read
 * as. Callers that know whose number it is pass `diallingCodeFor(locale)`; the
 * rest get the practice's own country, which is what everything did before.
 */
export function toWhatsappNumber(
  phone: string,
  defaultCountryCode = DEFAULT_DIALLING_CODE,
): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (hasPlus || digits.startsWith('00')) {
    return digits.replace(/^00/, '');
  }
  if (digits.startsWith('0')) {
    return defaultCountryCode + digits.slice(1);
  }
  if (digits.startsWith(defaultCountryCode)) {
    return digits;
  }
  return defaultCountryCode + digits;
}

export function whatsappLink(
  phone: string,
  message: string,
  /** The patient's language, when the caller knows it. See `diallingCodeFor`. */
  locale?: string | null,
): string | null {
  const number = toWhatsappNumber(phone, diallingCodeFor(locale));
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/**
 * The same chat with nothing typed into it.
 *
 * For "message this person", as against "send them this". A `?text=` that is
 * empty still works, but it is a query string that says nothing, and the whole
 * point of the distinction is that one of these two openings has wording behind
 * it that somebody composed and the other does not.
 *
 * **Why this matters more than it looks.** `wa.me` is an ordinary HTTPS URL, so
 * it opens on any machine that has a browser — WhatsApp Web, or the desktop app
 * if one is installed. `tel:` and `mailto:` are protocol hand-offs, and whether
 * they do anything at all depends on what the *workstation* has registered:
 * a front desk running Chrome with no mail client registered gets nothing at
 * all from a `mailto:`, silently. That asymmetry is why every screen in this app
 * that offers a way to reach somebody offers this one first, and why the others
 * are always accompanied by something that works regardless — a copy button, or
 * a send the server performs itself.
 */
export function whatsappChatLink(
  phone: string,
  /** The patient's language, when the caller knows it. See `diallingCodeFor`. */
  locale?: string | null,
): string | null {
  const number = toWhatsappNumber(phone, diallingCodeFor(locale));
  if (!number) return null;
  return `https://wa.me/${number}`;
}

/**
 * `tel:` with the spacing taken out.
 *
 * Albanian numbers are written `067 90 41 275` and a dialler handed that will
 * usually cope, but "usually" is doing work there — the spaces are display, and
 * a URL is not a display.
 */
export function telLink(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : null;
}

export function mailtoLink(email: string, subject: string, body: string): string | null {
  const address = email.trim();
  if (!address) return null;
  return `mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}
