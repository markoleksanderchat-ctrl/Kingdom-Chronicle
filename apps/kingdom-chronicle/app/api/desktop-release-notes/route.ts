import { DESKTOP_RELEASE } from "@/lib/desktop-release";
import { readPublishedRelease } from "@/lib/desktop-update-host";

export async function GET() {
  const { RELEASES } = (await import("cloudflare:workers")).env;
  const published = await readPublishedRelease(RELEASES);
  if (published?.legacy) return Response.json({ product: "Kingdom Chronicle", version: published.legacy.version,
    releasedAt: published.releasedAt, summary: "Moves Kingdom Chronicle to the new Windows update system.",
    changes: ["Preserves local reports and settings.", "The following update uses NSIS with differential downloads and automatic relaunch."] },
  { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  return Response.json({
    product: "Kingdom Chronicle",
    version: DESKTOP_RELEASE.version,
    releasedAt: DESKTOP_RELEASE.releasedAt,
    summary: DESKTOP_RELEASE.summary,
    changes: [
      "Fixed the navigation menu's brief vertical shift caused by text wrapping and a temporary horizontal scrollbar during opening.",
      "Keeps the existing animation timing, expanded and collapsed layout, appearance, and vertical scrolling.",
      "Preserves Detailed records, local read-only syncing, settings, and user-initiated verified updates.",
    ],
  }, { headers: { "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" } });
}
