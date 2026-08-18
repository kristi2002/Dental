import { NextResponse } from 'next/server';
import { recordView } from '@/lib/auth/guard';
import { getCurrentUser } from '@/lib/auth/session';
import { readStoredFile } from '@/lib/files';
import { prisma } from '@/lib/prisma';

/**
 * The only way a stored X-ray reaches a browser.
 *
 * Files are kept outside `public/` precisely so that this check cannot be
 * bypassed by guessing a URL: no session with `document.view`, no bytes. The id
 * in the path is a database id, not a filename, so it reveals nothing about
 * where anything lives on disk.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.permissions.includes('document.view')) {
    // 404 rather than 403: whether a given document exists is itself private.
    return new NextResponse(null, { status: 404 });
  }

  const { id } = await params;
  const document = await prisma.patientDocument.findUnique({
    where: { id },
    select: { fileName: true, mimeType: true, storageKey: true },
  });
  if (!document) return new NextResponse(null, { status: 404 });

  // Logged before the bytes go out rather than after: if this is ever read to
  // answer "what left the building", the answer should not depend on the
  // response having been written successfully.
  await recordView(user, {
    entity: 'document',
    entityId: id,
    summary: `Opened the file ${document.fileName}`,
  });

  let bytes: Buffer;
  try {
    bytes = await readStoredFile(document.storageKey);
  } catch (error) {
    console.error('[documents] missing file for', id, error);
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': document.mimeType,
      // `inline` so an X-ray opens in the viewer; the quoted name keeps a
      // comma or a quote in the original filename from breaking the header.
      'Content-Disposition': `inline; filename="${document.fileName.replace(/["\\]/g, '')}"`,
      'Content-Length': String(bytes.byteLength),
      // Private: a shared reception machine must not leave this in a proxy cache.
      'Cache-Control': 'private, no-store',
    },
  });
}
