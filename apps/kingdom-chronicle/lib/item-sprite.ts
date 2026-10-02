export interface ItemSprite {
  kind: "flat" | "cube" | "model";
  layers: string[];
  faces?: Array<{ texture: number; points: number[][]; transform: number[]; shade: number; tint?: string }>;
}

// Resource locations are canonical. Display names never select an asset.
export function validItemId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 180
    && /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(value)
    && !value.includes("..") && !value.includes(":/") && !value.endsWith("/");
}
