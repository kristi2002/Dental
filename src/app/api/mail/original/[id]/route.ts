import { NextResponse } from 'next/server';
import { recordView } from '@/lib/auth/guard';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

/**
 * The markup a message arrived as, handed over as a file.
 *
 * This is the only route in the app that reads `EmailMessage.html`, and it does
 * not render it — it serves it as `text/plain`, as a download, so the browser
 * treats attacker-chosen markup as what it is: a document to be saved and looked
 * at deliberately, not a page to be executed inside the practice's own origin.
 *
 * Serving it as `text/html` and letting the browser display it would be the
 * obvious "view original", and it would hand a stranger a script running on the
 * app's domain with the receptionist's session cookie. There is no sanitiser
 * here, no sandboxed frame, and no plan to add either: the text part is what the
 * screen shows, and this is the escape hatch for the rare message whose text
 * part was useless.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.permissions.includes('message.view')) {
    return new NextResponse(null, { status: 404 });
  }

  const { id } = await params;
  const message = await prisma.emailMessage.findUnique({
    where: { id },
    select: { html: true, subject: true, fromAddress: true },
  });
  if (!message?.html) return new NextResponse(null, { status: 404 });

  await recordView(user, {
    entity: 'message',
    entityId: id,
    summary: `Downloaded the original of "${message.subject}" from ${message.fromAddress}`,
  });

  return new NextResponse(message.html, {
    headers: {
      // Deliberately not `text/html`. See above — this is the whole point.
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="message-${id}.html"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
