import { formatNumber } from "../colony";

export function signedDelta(value: number | null | undefined, previous: number | null | undefined, digits = 0) {
  if (value == null || previous == null || !Number.isFinite(value) || !Number.isFinite(previous)) return null;
  const delta = value - previous;
  if (Math.abs(delta) < 10 ** -digits / 2) return "No change";
  return `${delta > 0 ? "+" : "−"}${formatNumber(Math.abs(delta), digits)}`;
}
