/**
 * What a file *is*, read off its first bytes rather than off what the upload
 * claimed.
 *
 * `File.type` is a string the browser derives from the extension and hands over
 * with the multipart body. On the staff screens that is good enough: whoever
 * uploaded it signed in, is named in the audit trail, and could just as easily
 * have walked round with a USB stick.
 *
 * The public booking form is not that. Anybody with a browser can post to it,
 * the declared type is a field they control, and it is the exact string this app
 * later writes back into a `Content-Type` header when the desk opens the file.
 * A response is only as honest as the type on it, and "trust the sender" is not
 * a way to fill that header in.
 *
 * So the request form stores what these signatures say, and refuses anything
 * they do not recognise. A `.pdf` that is really an HTML page is not stored as
 * `application/pdf`; it is not stored at all.
 *
 * Deliberately narrow. This is not a general file-type library — it answers for
 * exactly the five types in `ALLOWED_MIME_TYPES` and returns null for everything
 * else, which is the answer a public endpoint should give to anything it was not
 * expecting. Pure, with no Node imports, so `tests/file-signature.test.ts` can
 * exercise it directly.
 */

/** Does `bytes` carry `ascii` at `offset`? */
function has(bytes: Uint8Array, offset: number, ascii: string): boolean {
  if (bytes.length < offset + ascii.length) return false;
  for (let i = 0; i < ascii.length; i += 1) {
    if (bytes[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((byte, index) => bytes[index] === byte);
}

/**
 * The ISO base-media brands that mean "this is a HEIF still".
 *
 * A HEIC file is an MP4 container wearing a different hat, so the brand at byte
 * 8 is the only thing separating a photograph from a video. `mif1`/`msf1` are
 * the generic image brands an iPhone also writes; anything else with an `ftyp`
 * box — `isom`, `mp42` — is a video and is not on the allowlist.
 */
const HEIF_BRANDS = ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1'];

/**
 * The MIME type these bytes really are, or null when it is none of the five the
 * practice accepts.
 *
 * Only the head of the file is needed — 16 bytes would do — so callers may pass
 * a slice rather than the whole radiograph.
 */
export function sniffMimeType(bytes: Uint8Array): string | null {
  // FF D8 FF — every JPEG, whatever the JFIF/Exif flavour after it.
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';

  // The eight-byte PNG signature, including the CRLF pair that catches a file
  // mangled by a text-mode transfer.
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';

  // RIFF….WEBP — a RIFF container is not enough on its own, since WAV is one too.
  if (has(bytes, 0, 'RIFF') && has(bytes, 8, 'WEBP')) return 'image/webp';

  if (has(bytes, 4, 'ftyp') && HEIF_BRANDS.some((brand) => has(bytes, 8, brand))) {
    return 'image/heic';
  }

  // `%PDF-`. Producers are supposed to put it at byte zero and most do; readers
  // tolerate it a little way in, so a couple of stray bytes at the front should
  // not cost somebody their referral letter.
  for (let offset = 0; offset <= 4; offset += 1) {
    if (has(bytes, offset, '%PDF-')) return 'application/pdf';
  }

  return null;
}
