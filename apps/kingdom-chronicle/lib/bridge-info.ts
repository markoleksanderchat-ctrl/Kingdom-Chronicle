import {
  COLONY_PROTOCOL_ID,
  MAX_LATEST_FILES,
  SUPPORTED_OUTPUT_LAYOUT_VERSION,
  SUPPORTED_SNAPSHOT_SCHEMA,
} from "./runtime-contract.ts";

export interface BridgeInfo {
  bridgeVersion: string;
  protocolId: string;
  schemaVersion: number;
  outputLayoutVersion: number;
  transport: string;
  readOnly: boolean;
  status: string;
  outputRoot: string;
  latestFiles: string[];
  coloniesDetected: number;
  lastSuccessfulExportAt: string | null;
}

export interface BridgeCompatibilityIssue {
  code: "malformed" | "protocol" | "schema" | "layout" | "transport" | "write_capable" | "too_many_files";
  message: string;
}

export interface BridgeCompatibilityResult {
  compatible: boolean;
  info: BridgeInfo | null;
  issues: BridgeCompatibilityIssue[];
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function malformed(message: string): BridgeCompatibilityResult {
  return { compatible: false, info: null, issues: [{ code: "malformed", message }] };
}

export function inspectBridgeInfo(value: unknown): BridgeCompatibilityResult {
  if (!record(value)) return malformed("bridge-info.json must contain a JSON object.");
  if (!nonEmptyString(value.bridgeVersion)) return malformed("Bridge version is missing.");
  if (!nonEmptyString(value.protocolId)) return malformed("Protocol ID is missing.");
  if (!Number.isInteger(value.schemaVersion)) return malformed("Snapshot schema version is missing or invalid.");
  if (!Number.isInteger(value.outputLayoutVersion)) return malformed("Output layout version is missing or invalid.");
  if (!nonEmptyString(value.transport)) return malformed("Transport is missing.");
  if (typeof value.readOnly !== "boolean") return malformed("The read-only declaration is missing.");
  if (!nonEmptyString(value.status)) return malformed("Bridge status is missing.");
  if (!nonEmptyString(value.outputRoot)) return malformed("Bridge output root is missing.");
  if (!Number.isInteger(value.coloniesDetected) || (value.coloniesDetected as number) < 0) {
    return malformed("Detected colony count is missing or invalid.");
  }
  if (!Array.isArray(value.latestFiles) || !value.latestFiles.every(nonEmptyString)) {
    return malformed("Latest snapshot paths are missing or invalid.");
  }
  if (value.lastSuccessfulExportAt != null && !nonEmptyString(value.lastSuccessfulExportAt)) {
    return malformed("Last successful export time is invalid.");
  }

  const info: BridgeInfo = {
    bridgeVersion: value.bridgeVersion,
    protocolId: value.protocolId,
    schemaVersion: value.schemaVersion as number,
    outputLayoutVersion: value.outputLayoutVersion as number,
    transport: value.transport,
    readOnly: value.readOnly,
    status: value.status,
    outputRoot: value.outputRoot,
    latestFiles: [...value.latestFiles],
    coloniesDetected: value.coloniesDetected as number,
    lastSuccessfulExportAt: (value.lastSuccessfulExportAt as string | null | undefined) ?? null,
  };
  const issues: BridgeCompatibilityIssue[] = [];
  if (info.protocolId !== COLONY_PROTOCOL_ID) {
    issues.push({ code: "protocol", message: `This app does not understand protocol ${info.protocolId}.` });
  }
  if (info.schemaVersion !== SUPPORTED_SNAPSHOT_SCHEMA) {
    issues.push({ code: "schema", message: `This app supports snapshot schema ${SUPPORTED_SNAPSHOT_SCHEMA}, not ${info.schemaVersion}.` });
  }
  if (info.outputLayoutVersion !== SUPPORTED_OUTPUT_LAYOUT_VERSION) {
    issues.push({ code: "layout", message: `This app supports output layout ${SUPPORTED_OUTPUT_LAYOUT_VERSION}, not ${info.outputLayoutVersion}.` });
  }
  if (info.transport !== "filesystem") {
    issues.push({ code: "transport", message: `This app requires the filesystem transport, not ${info.transport}.` });
  }
  if (!info.readOnly) {
    issues.push({ code: "write_capable", message: "This bridge does not declare a read-only boundary." });
  }
  if (info.latestFiles.length > MAX_LATEST_FILES) {
    issues.push({ code: "too_many_files", message: `Bridge listed more than ${MAX_LATEST_FILES} latest snapshots.` });
  }
  return { compatible: issues.length === 0, info, issues };
}
