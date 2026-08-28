import { NextResponse } from 'next/server';
import { recordView } from '@/lib/auth/guard';
import { getCurrentUser } from '@/lib/auth/session';
import { readStoredFile } from '@/lib/files';
import { prisma } from '@/lib/prisma';

/**
 * The only way a file pinned to a follow-up reaches a browser.
 *
 * The twin of `/api/documents/[id]`, and the same reasoning throughout: the
 * bytes live outside `public/` so that this check cannot be walked around by
 * guessing a filename, the id in the path is a database id rather than a
 * storage key, and a caller without the permission is told 404 rather than 403
 * — whether a given file exists is itself private.
 *
 * Gated on `followup.view`, not `document.view`. A photograph of a cracked
 * casting attached to "ring the lab" is a working note; it is deliberately not
 * filed in the patient's record, and it should not need the permission that
 * opens radiographs.
 *
 * **And the file has to be the one you asked for**, exactly as the documents
 * route requires. That check was the one thing this twin did not copy, and the
 * omission read as deliberate only because the paragraph above explains the
 * *permission* choice and never mentions ownership. The permission says
 * somebody may read the practice's working notes; it does not say *which*, and
 * without the claim below anyone holding it — the front desk included — could
 * walk ids and be handed every attachment in the practice one at a time.
 *
 * So the caller names the follow-up it believes the file belongs to, and a
 * mismatch is a 404. Not a second permission: everyone who may open this board
 * may open this file. It is the difference between reaching a file *through*
 * the follow-up it is pinned to, which is the only route the app itself takes,
 * and reaching it by guessing a number.
 *
 * Required rather than optional-if-present, for the reason its twin gives: an
 * optional check is one a caller can decline, which is no check.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.permissions.includes('followup.view')) {
    return new NextResponse(null, { status: 404 });
  }

  const { id } = await params;
  const claimed = new URL(request.url).searchParams.get('followUp');
  if (!claimed) return new NextResponse(null, { status: 404 });

  const attachment = await prisma.followUpAttachment.findUnique({
    where: { id },
    select: { fileName: true, mimeType: true, storageKey: true, followUpId: true },
  });
  if (!attachment) return new NextResponse(null, { status: 404 });

  // The same 404 as a missing row, and deliberately not distinguishable: a 403
  // here would confirm the id exists, which is the one bit an id-walker is after.
  if (attachment.followUpId !== claimed) {
    console.warn('[follow-ups] refused', id, 'claimed for the wrong follow-up by', user.id);
    return new NextResponse(null, { status: 404 });
  }

  await recordView(user, {
    entity: 'followup',
    entityId: id,
    summary: `Opened the file ${attachment.fileName}`,
  });

  let bytes: Buffer;
  try {
    bytes = await readStoredFile(attachment.storageKey);
  } catch (error) {
    console.error('[follow-ups] missing file for', id, error);
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `inline; filename="${attachment.fileName.replace(/["\\]/g, '')}"`,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}
