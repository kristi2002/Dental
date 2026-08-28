import { NextResponse } from 'next/server';
import { recordView } from '@/lib/auth/guard';
import { getCurrentUser } from '@/lib/auth/session';
import { readStoredFile } from '@/lib/files';
import { prisma } from '@/lib/prisma';

/**
 * The only way a file somebody attached to a booking request reaches a browser.
 *
 * The third of these routes, and the same reasoning as `/api/documents/[id]` and
 * `/api/follow-up-files/[id]` throughout: the bytes live outside `public/` so
 * this check cannot be walked around by guessing a filename, the id in the path
 * is a database id rather than a storage key, a caller without the permission is
 * told 404 rather than 403 — whether a given file exists is itself private — and
 * the caller must name the request it believes the file belongs to, so a walked
 * id fails unless the walker already holds the row it goes with.
 *
 * Gated on `request.view`, the permission that opens the desk's list of enquiries
 * off the public page. Not `document.view`: an X-ray a stranger attached to a
 * form is not in anybody's medical record and should not need the permission
 * that opens one. If the desk decides to keep it, somebody uploads it to the
 * patient's chart deliberately and it becomes a `PatientDocument` — which is
 * the moment it starts needing that permission, and the moment somebody's name
 * is against the decision to keep it.
 *
 * **The one thing this route has that the other two do not** is that the bytes
 * were posted by somebody with no account. `requestAppointment` reads the type
 * off the file's own first bytes rather than off what the upload claimed, so
 * the `Content-Type` below is a fact about the file rather than a string a
 * stranger chose — which matters here, because `inline` asks the browser to
 * render it.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.permissions.includes('request.view')) {
    return new NextResponse(null, { status: 404 });
  }

  const { id } = await params;
  const claimed = new URL(request.url).searchParams.get('request');
  if (!claimed) return new NextResponse(null, { status: 404 });

  const attachment = await prisma.appointmentRequestAttachment.findUnique({
    where: { id },
    select: { fileName: true, mimeType: true, storageKey: true, requestId: true },
  });
  if (!attachment) return new NextResponse(null, { status: 404 });

  // The same 404 as a missing row, and deliberately not distinguishable: a 403
  // here would confirm the id exists, which is the one bit an id-walker is after.
  if (attachment.requestId !== claimed) {
    console.warn('[requests] refused', id, 'claimed for the wrong request by', user.id);
    return new NextResponse(null, { status: 404 });
  }

  // Against the request rather than the file, which is the id every other line
  // about this table carries — see the warning in `audit-links.ts` about an
  // entity name that means two different kinds of id depending on who wrote it.
  // `recordView` de-duplicates within its window, so opening three files off one
  // enquiry is one line saying the desk read it, which is what the trail is for.
  await recordView(user, {
    entity: 'appointmentRequest',
    entityId: attachment.requestId,
    summary: `Opened the file ${attachment.fileName}`,
  });

  let bytes: Buffer;
  try {
    bytes = await readStoredFile(attachment.storageKey);
  } catch (error) {
    console.error('[requests] missing file for', id, error);
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `inline; filename="${attachment.fileName.replace(/["\\]/g, '')}"`,
      'Content-Length': String(bytes.byteLength),
      // Private: a shared reception machine must not leave this in a proxy cache.
      'Cache-Control': 'private, no-store',
    },
  });
}
