export const COLONY_PROTOCOL_ID = "com.colonybridge.snapshot";
export const SUPPORTED_SNAPSHOT_SCHEMA = 2;
export const SUPPORTED_OUTPUT_LAYOUT_VERSION = 1;
export const MAX_SNAPSHOT_BYTES = 1_000_000;
export const MAX_BRIDGE_INFO_BYTES = 64_000;
export const MAX_LATEST_FILES = 64;

export const runtimeCapabilities = Object.freeze({
  latestSnapshot: true,
  snapshotHistory: true,
  authenticatedUpload: true,
  offlineSnapshotSource: true,
  writesMinecraftSave: false,
});
