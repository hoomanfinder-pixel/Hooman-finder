export const INITIAL_DOG_CARD_COUNT = 24;
export const DOG_CARD_BATCH_SIZE = 24;

export function getVisibleDogItems(items, visibleCount) {
  if (!Array.isArray(items)) return [];
  const count = Number.isFinite(Number(visibleCount))
    ? Math.max(0, Math.floor(Number(visibleCount)))
    : INITIAL_DOG_CARD_COUNT;
  return items.slice(0, count);
}

export function getNextVisibleDogCount(currentCount, totalCount) {
  const current = Math.max(0, Number(currentCount) || 0);
  const total = Math.max(0, Number(totalCount) || 0);
  return Math.min(total, current + DOG_CARD_BATCH_SIZE);
}
