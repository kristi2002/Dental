import { prisma } from '@/lib/prisma';

export type ConsumedLine = { itemId: string; name: string; quantity: number; unit: string };

/**
 * Turn "this visit included a filling and a cleaning" into the stock movements
 * that actually happened.
 *
 * Two services that share a material are summed into a single movement, so the
 * log reads as one line per material per visit rather than a scatter of −1s.
 * Quantity is floored at zero: a cupboard cannot hold −3 gloves, and refusing to
 * record the treatment because the count drifted would be the wrong trade.
 */
export async function consumeMaterialsForServices(
  serviceIds: string[],
  staffUserId: string,
): Promise<ConsumedLine[]> {
  if (serviceIds.length === 0) return [];

  const materials = await prisma.serviceMaterial.findMany({
    where: { serviceId: { in: serviceIds } },
    select: {
      quantity: true,
      item: { select: { id: true, name: true, quantity: true, unit: true } },
    },
  });
  if (materials.length === 0) return [];

  const totals = new Map<string, ConsumedLine & { onHand: number }>();
  for (const material of materials) {
    const existing = totals.get(material.item.id);
    if (existing) {
      existing.quantity += material.quantity;
    } else {
      totals.set(material.item.id, {
        itemId: material.item.id,
        name: material.item.name,
        quantity: material.quantity,
        unit: material.item.unit,
        onHand: material.item.quantity,
      });
    }
  }

  const lines = [...totals.values()]
    .map((line) => ({ ...line, quantity: Math.min(line.quantity, line.onHand) }))
    .filter((line) => line.quantity > 0);
  if (lines.length === 0) return [];

  await prisma.$transaction(
    lines.flatMap((line) => [
      prisma.stockItem.update({
        where: { id: line.itemId },
        data: { quantity: { decrement: line.quantity } },
      }),
      prisma.stockMovement.create({
        data: {
          itemId: line.itemId,
          delta: -line.quantity,
          reason: 'used in visit',
          staffUserId,
        },
      }),
    ]),
  );

  return lines.map(({ itemId, name, quantity, unit }) => ({ itemId, name, quantity, unit }));
}
