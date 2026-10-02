import {
  COLONY_PROTOCOL_ID,
  MAX_BRIDGE_INFO_BYTES,
  MAX_LATEST_FILES,
  MAX_SNAPSHOT_BYTES,
  SUPPORTED_OUTPUT_LAYOUT_VERSION,
  SUPPORTED_SNAPSHOT_SCHEMA,
  runtimeCapabilities,
} from "@/lib/runtime-contract";

export async function GET() {
  return Response.json({
    status: "ready",
    product: "Kingdom Chronicle",
    surface: "desktop-update-service",
    hostedDashboard: "retired",
    protocolId: COLONY_PROTOCOL_ID,
    supportedSnapshotSchemas: [SUPPORTED_SNAPSHOT_SCHEMA],
    supportedOutputLayoutVersions: [SUPPORTED_OUTPUT_LAYOUT_VERSION],
    maxSnapshotBytes: MAX_SNAPSHOT_BYTES,
    maxBridgeInfoBytes: MAX_BRIDGE_INFO_BYTES,
    maxLatestFiles: MAX_LATEST_FILES,
    capabilities: runtimeCapabilities,
  }, { headers: { "cache-control": "no-store" } });
}
