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
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.permissions.includes('followup.view')) {
    return new NextResponse(null, { status: 404 });
  }

  const { id } = await params;
  const attachment = await prisma.followUpAttachment.findUnique({
    where: { id },
    select: { fileName: true, mimeType: true, storageKey: true },
  });
  if (!attachment) return new NextResponse(null, { status: 404 });

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
