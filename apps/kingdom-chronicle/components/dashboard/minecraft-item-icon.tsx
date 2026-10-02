import { createContext, memo, useContext, useEffect, useId, useState } from "react";
/* eslint-disable @next/next/no-img-element -- Local data PNGs in Electron; no image service or remote requests. */
import { validItemId, type ItemSprite } from "@/lib/item-sprite";

export type ItemSpriteLoader = (id: string) => Promise<ItemSprite | null>;
export const ItemSpriteContext = createContext<ItemSpriteLoader | null>(null);

export const MinecraftItemIcon = memo(function MinecraftItemIcon({ registryId, displayName, size = 28, tooltip, fallback = "item" }: {
  registryId?: string | null; displayName?: string; size?: number; tooltip?: string; fallback?: "item" | "building";
}) {
  const load = useContext(ItemSpriteContext);
  const clipId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [resolved, setResolved] = useState<{ id: string; sprite: ItemSprite } | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (load && validItemId(registryId)) {
      void load(registryId).then((sprite) => {
        if (active) setResolved(sprite ? { id: registryId, sprite } : null);
      }).catch(() => { if (active) setResolved(null); });
    }
    return () => { active = false; };
  }, [load, registryId]);
  const sprite = resolved && resolved.id === registryId && failedId !== registryId ? resolved.sprite : null;
  return <span className="minecraft-item-icon" style={{ width: size, height: size }} title={tooltip ?? displayName ?? registryId ?? undefined} aria-hidden="true">
    {sprite?.kind === "model" ? <svg viewBox="0 0 32 32" shapeRendering="crispEdges">
      {sprite.faces?.map((face, index) => <g key={index}>
        <defs><clipPath id={`${clipId}-${index}`}><polygon points={face.points.map(p => p.join(",")).join(" ")} /></clipPath></defs>
        <g clipPath={`url(#${clipId}-${index})`} style={{ isolation: "isolate" }}>
          <image href={sprite.layers[face.texture]} width="16" height="16" transform={`matrix(${face.transform.join(" ")})`} onError={() => setFailedId(registryId ?? null)} />
          {face.tint && <polygon points={face.points.map(p => p.join(",")).join(" ")} fill={face.tint} style={{ mixBlendMode: "multiply" }} />}
          {face.shade > 0 && <polygon points={face.points.map(p => p.join(",")).join(" ")} fill="#000" opacity={face.shade} />}
        </g>
      </g>)}
    </svg> : sprite?.kind === "cube" ? <svg viewBox="0 0 32 32" shapeRendering="crispEdges">
      <image href={sprite.layers[0]} width="16" height="16" transform="matrix(1 .5 -1 .5 16 0)" />
      <image href={sprite.layers[1]} width="16" height="16" transform="matrix(1 .5 0 1 0 8)" />
      <image href={sprite.layers[2]} width="16" height="16" transform="matrix(1 -.5 0 1 16 16)" />
      <path d="M0 8l16 8v16L0 24z" fill="#000" opacity=".16" /><path d="M16 16l16-8v16l-16 8z" fill="#000" opacity=".28" />
    </svg> : sprite ? sprite.layers.map((layer, index) => <img key={index} src={layer} alt="" width={size} height={size} onError={() => setFailedId(registryId ?? null)} />)
      : <svg className="item-placeholder" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
        {fallback === "building" ? <path d="M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6M8 10h2m4 0h2" />
          : registryId === "minecraft:shield" || (!registryId && displayName?.toLowerCase() === "shield") ? <path d="M5 4h14v9c0 4-4 6-7 8-3-2-7-4-7-8zM12 5v14" />
          : <><path d="M12 3l8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10" /><path d="M8 5l8 4" /></>}
      </svg>}
  </span>;
});

export function ResourceRow({ item, count, label, source, note, dimmed = false }: {
  item: string; count: number; label: string; source?: string; note?: string; dimmed?: boolean;
}) {
  return <div className={`resource-row${dimmed ? " out-of-stock" : ""}`} role="listitem" title={`${label}\n${item}\nStored: ${count.toLocaleString()}`}>
    <MinecraftItemIcon registryId={item} displayName={label} />
    <span className="resource-name">{label}{source && <small className="source-badge">{source}</small>}</span>
    {note && <small className="resource-note">{note}</small>}<strong>{count.toLocaleString()}</strong>
  </div>;
}
