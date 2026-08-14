/**
 * The treatment catalog is organised by department — Endodontics, Surgery,
 * Orthodontics — and every picker in the app splits it the same way, so a
 * treatment is always found in the same place whether it is being booked,
 * recorded on a visit, or added to the waiting list.
 */

export type Categorised = { category: string };

/**
 * The heading a catalogue entry is printed under.
 *
 * A treatment is filed against one `ServiceCategory`, which is either a
 * department or a subcategory of one — so the department is the parent's name
 * when there is a parent, and the category's own otherwise. Every picker groups
 * by this, which is what keeps subdividing a department from splitting it.
 */
export function departmentOf(
  category: { name: string; parent: { name: string } | null } | null,
): string {
  if (!category) return '';
  return category.parent?.name ?? category.name;
}

export type Department<T> = { department: string; items: T[] };

/**
 * Groups by department, keeping the catalog's own order within each group.
 * Anything with no department is collected last: an unfiled treatment is a
 * leftover to tidy up, not a heading to lead with.
 */
export function byDepartment<T extends Categorised>(items: T[]): Array<Department<T>> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = item.category.trim();
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : 0))
    .map(([department, grouped]) => ({ department, items: grouped }));
}
