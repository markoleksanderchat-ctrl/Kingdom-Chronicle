import { formatNumber, identifierName, itemSource } from "@/lib/colony";
import type { DashboardModel } from "@/lib/dashboard-model";
import { ResourceRow } from "./minecraft-item-icon";

export function InventoryList({ model }: { model: DashboardModel }) {
  const rows = (items: readonly (readonly [string, number])[]) => <div className="stock-list" role="list">
    {items.map(([item, count]) => <ResourceRow key={item} item={item} count={count} label={identifierName(item)}
      source={!item.startsWith("minecraft:") || (model.friendlyNameCounts.get(identifierName(item)) ?? 0) > 1 ? itemSource(item) : undefined} />)}
    {!items.length && <p className="empty-state">{model.normalizedStockQuery ? "No items match your search." : "No stored items reported."}</p>}
  </div>;
  if (model.normalizedStockQuery) return rows(model.visibleStockItems);
  const complete = model.stockLedger && !model.stockLedger.truncated && !model.stockLedger.omittedItemTypes;
  const priorities = new Map<string, number>();
  for (const request of model.requests) {
    if (request.requestedItemRegistryId && (request.remainingQuantity ?? 0) > 0)
      priorities.set(request.requestedItemRegistryId, (priorities.get(request.requestedItemRegistryId) ?? 0) + request.remainingQuantity!);
  }
  const lowStock: [string, number][] = [];
  for (const [id, requested] of priorities) {
    const stored = model.stockLedger?.itemsById[id];
    if ((stored !== undefined || complete) && (stored ?? 0) < requested) lowStock.push([id, stored ?? 0]);
  }
  for (const id of model.missingMenuFoods) {
    const stored = model.stockLedger?.itemsById[id];
    if ((stored === 0 || (stored === undefined && complete)) && !lowStock.some(([item]) => item === id)) lowStock.push([id, 0]);
  }
  return <>
    <div className="inventory-groups">
      <section><h3>Low-stock priorities</h3><p className="muted">Below open requests or menu food out of stock · last storage count</p>{lowStock.length ? rows(lowStock) : <p className="muted">No shortages identified in the counted inventory.</p>}</section>
      <section className="stock-changes"><h3>Largest changes</h3>{model.previousItems && !model.stockCoverageChanged && model.stockChanges.length > 0 ? <ul>{model.stockChanges.map(({ item, delta }) => <li key={item}><span>{identifierName(item)}</span><strong className={delta < 0 ? "negative" : "positive"}>{delta > 0 ? "+" : "−"}{formatNumber(Math.abs(delta))}</strong></li>)}</ul> : <p className="muted">{model.stockCoverageChanged ? "Storage coverage changed; comparisons paused." : "No comparable item changes recorded."}</p>}</section>
    </div>
    <h3>Counted inventory ({model.visibleStockItems.length})</h3>
    {rows(model.visibleStockItems)}
  </>;
}
