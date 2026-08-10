/**
 * Reminders are deliberately "link only": we never send anything on the
 * dentist's behalf. Each helper builds a pre-filled `wa.me` / `mailto:` URL that
 * opens WhatsApp or the mail client with the message ready to review and send.
 */

/**
 * `wa.me` needs a bare international number: digits only, no `+`, no spaces.
 * Albanian numbers are commonly written as `069 12 34 567` or `+355 69 …`, so we
 * normalise a local `0`-prefixed number to the country code when one is given.
 */
export function toWhatsappNumber(phone: string, defaultCountryCode = '355'): string | null {
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

export function whatsappLink(phone: string, message: string): string | null {
  const number = toWhatsappNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function mailtoLink(email: string, subject: string, body: string): string | null {
  const address = email.trim();
  if (!address) return null;
  return `mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}
