import { NextResponse } from 'next/server';
import { can } from '@/lib/auth/session';
import { readStoredFile } from '@/lib/files';
import { prisma } from '@/lib/prisma';
import { isPhotoOwner } from '@/lib/stock-photos';

/**
 * The only way a stored product photograph reaches a browser.
 *
 * Photographs live outside `public/` with the X-rays — not because a box of
 * gloves is confidential, but because `storeFile` puts everything in one private
 * directory and a route that served files from it by filename would serve *any*
 * of them, radiographs included. The id in the path is a database id, so it
 * reveals nothing about where anything sits on disk.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  if (!(await can('stock.view'))) {
    // 404 rather than 403, as `/api/documents/[id]` does: whether a given row
    // exists is not a question an unauthenticated request gets answered.
    return new NextResponse(null, { status: 404 });
  }

  const { kind, id } = await params;
  if (!isPhotoOwner(kind)) return new NextResponse(null, { status: 404 });

  const owner =
    kind === 'item'
      ? await prisma.stockItem.findUnique({
          where: { id },
          select: { photoKey: true, photoMime: true },
        })
      : await prisma.stockProduct.findUnique({
          where: { id },
          select: { photoKey: true, photoMime: true },
        });

  if (!owner?.photoKey) return new NextResponse(null, { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readStoredFile(owner.photoKey);
  } catch (error) {
    console.error('[stock photo] missing file for', kind, id, error);
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': owner.photoMime ?? 'application/octet-stream',
      'Content-Length': String(bytes.byteLength),
      // Immutable is safe *because* of the `v` token `photoUrl` appends: a
      // replaced photo is a new storage key and therefore a new URL. Private
      // all the same — a shared reception machine must not leave these in a
      // proxy cache alongside whatever else this app serves.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
