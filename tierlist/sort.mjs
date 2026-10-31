// Return the item before which to insert, accounting for wrapped rows and both halves of a tile.
export function insertionBefore(items, x, y) {
  if (!items.length) return null;
  let nearest = items[0], distance = Infinity;
  for (const item of items) {
    const delta = Math.abs(y - (item.top + item.height / 2));
    if (delta < distance) { nearest = item; distance = delta; }
  }
  const row = items.filter(item => Math.abs(item.top - nearest.top) < nearest.height / 2);
  const before = row.find(item => x < item.left + item.width / 2);
  if (before) return before.id;
  return items[items.indexOf(row.at(-1)) + 1]?.id || null;
}
