import { NextResponse } from 'next/server';
import { recordView } from '@/lib/auth/guard';
import { getCurrentUser } from '@/lib/auth/session';
import { readStoredFile } from '@/lib/files';
import { prisma } from '@/lib/prisma';

/**
 * A file somebody emailed the practice.
 *
 * The same arrangement as `/api/documents/[id]` — outside `public/`, handed out
 * only against a session — with one deliberate difference: this one always
 * downloads and never displays inline.
 *
 * **Why `attachment` and not `inline`.** A patient's X-ray in their record was
 * uploaded by a member of staff who looked at it first. This arrived from an
 * unauthenticated stranger, and the MIME type on it is one *they* chose. The
 * allowlist in `usableAttachments` already refuses everything but images and
 * PDFs, and rendering a stranger's PDF inside the app's own origin is still a
 * needless amount of trust to place in a viewer. Downloading it hands the
 * decision to the operating system, where it belongs.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.permissions.includes('message.view')) {
    // 404 rather than 403, as everywhere else: whether a file exists is private.
    return new NextResponse(null, { status: 404 });
  }

  const { id } = await params;
  const attachment = await prisma.emailAttachment.findUnique({
    where: { id },
    select: {
      fileName: true,
      mimeType: true,
      storageKey: true,
      message: { select: { fromAddress: true } },
    },
  });
  if (!attachment) return new NextResponse(null, { status: 404 });

  await recordView(user, {
    entity: 'message',
    entityId: id,
    summary: `Downloaded ${attachment.fileName} from ${attachment.message.fromAddress}`,
  });

  let bytes: Buffer;
  try {
    bytes = await readStoredFile(attachment.storageKey);
  } catch (error) {
    console.error('[mail] missing attachment for', id, error);
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `attachment; filename="${attachment.fileName.replace(/["\\]/g, '')}"`,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, no-store',
      // Belt and braces on a file whose type was chosen by the sender: even if
      // the header above were ever wrong, the browser must not go looking for a
      // better answer and decide this is HTML.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
