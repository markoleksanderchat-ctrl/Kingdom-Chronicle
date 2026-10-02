import { identifierName } from "../colony";
import type { StockLedger } from "../colony-schema";

export function selectStock(stockLedger: StockLedger | undefined) {
  const items = Object.entries(stockLedger?.itemsById ?? {})
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const friendlyNameCounts = new Map<string, number>();
  items.forEach(([item]) => {
    const name = identifierName(item);
    friendlyNameCounts.set(name, (friendlyNameCounts.get(name) ?? 0) + 1);
  });
  return { items, friendlyNameCounts };
}

export function filterStock(items: ReadonlyArray<readonly [string, number]>, query: string, simple: boolean) {
  const normalizedQuery = query.trim().toLowerCase();
  const matching = items.filter(([item]) => !normalizedQuery || identifierName(item).toLowerCase().includes(normalizedQuery)
    || item.toLowerCase().includes(normalizedQuery));
  return { normalizedQuery, matching, visible: simple && !normalizedQuery ? matching.slice(0, 12) : matching };
}

export function selectStockHistory(current: StockLedger | undefined, previous: StockLedger | undefined) {
  const previousItems = previous?.itemsById;
  const completeCurrent = current && !current.truncated && current.omittedItemTypes === 0;
  const completePrevious = previous && !previous.truncated && previous.omittedItemTypes === 0;
  const changes = previousItems ? [...new Set([...Object.keys(current?.itemsById ?? {}), ...Object.keys(previousItems)])]
    .filter((item) => (current?.itemsById[item] !== undefined || completeCurrent)
      && (previousItems[item] !== undefined || completePrevious))
    .map((item) => ({ item, delta: (current?.itemsById[item] ?? 0) - (previousItems?.[item] ?? 0) }))
    .filter((item) => item.delta !== 0)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.item.localeCompare(right.item)).slice(0, 8) : [];
  const coverageChanged = Boolean(current && previous && current.scannedHandlers === previous.scannedHandlers
    && Math.abs(current.scannedSlots - previous.scannedSlots) >= Math.max(64, previous.scannedSlots * 0.1));
  return { previousItems, changes, coverageChanged };
}
