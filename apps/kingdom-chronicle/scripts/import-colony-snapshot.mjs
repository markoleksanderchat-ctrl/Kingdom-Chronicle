import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Colony Bridge snapshot must be a JSON object.");
  }
  if (snapshot.schemaVersion !== 2) {
    throw new Error(`Unsupported Colony Bridge schema ${snapshot.schemaVersion ?? "unknown"}; Kingdom Chronicle expects schema 2.`);
  }
  if (!snapshot.colony || !snapshot.summary || !snapshot.environment || !snapshot.territory) {
    throw new Error("Snapshot is missing colony, summary, environment, or territory data.");
  }
  for (const field of ["citizens", "buildings", "requests", "construction", "warnings", "errors"]) {
    if (!Array.isArray(snapshot[field])) {
      throw new Error(`Snapshot field ${field} must be an array.`);
    }
  }
  if (!snapshot.research || !Array.isArray(snapshot.research.completed) || !Array.isArray(snapshot.research.inProgress)) {
    throw new Error("Snapshot research data is incomplete.");
  }
  return snapshot;
}

export function sanitizeSnapshot(input) {
  const snapshot = structuredClone(validateSnapshot(input));
  delete snapshot.world?.worldId;
  delete snapshot.colony.ownerUuid;
  delete snapshot.colony.center;

  const alias = (prefix, value) => `${prefix}-${createHash("sha256").update(String(value)).digest("hex").slice(0, 12)}`;
  const buildingIds = new Map(snapshot.buildings.map((building) => [building.id, alias("building", building.id)]));
  const requestIds = new Map(snapshot.requests.map((request) => [request.id, alias("request", request.id)]));
  const buildingId = (value) => value == null ? value : (buildingIds.get(value) ?? null);
  const requestId = (value) => value == null ? value : (requestIds.get(value) ?? null);

  snapshot.citizens = snapshot.citizens
    .map((citizen) => {
      delete citizen.uuid;
      delete citizen.currentPosition;
      delete citizen.lastKnownPosition;
      citizen.workplaceBuildingId = buildingId(citizen.workplaceBuildingId);
      citizen.homeBuildingId = buildingId(citizen.homeBuildingId);
      for (const key of ["bedPosition", "statusPosition", "homePosition"]) {
        if (citizen.details) delete citizen.details[key];
      }
      return citizen;
    })
    .sort((left, right) => (left.id ?? Number.MAX_SAFE_INTEGER) - (right.id ?? Number.MAX_SAFE_INTEGER));

  snapshot.buildings = snapshot.buildings
    .map((building) => {
      building.id = buildingId(building.id);
      delete building.position;
      building.openRequestIds = (building.openRequestIds ?? []).map(requestId).filter(Boolean);
      return building;
    })
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

  snapshot.requests = snapshot.requests
    .map((request) => {
      request.id = requestId(request.id);
      request.requestingBuildingId = buildingId(request.requestingBuildingId);
      request.parentRequestId = requestId(request.parentRequestId);
      request.childRequestIds = (request.childRequestIds ?? []).map(requestId).filter(Boolean);
      return request;
    })
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

  snapshot.construction = snapshot.construction.map((project) => {
    project.buildingId = buildingId(project.buildingId);
    project.builderHutId = buildingId(project.builderHutId);
    if (project.details) {
      delete project.details.location;
      delete project.details.bounds;
    }
    return project;
  });

  return snapshot;
}

export async function importSnapshot(inputPath, outputPath) {
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const sanitized = sanitizeSnapshot(input);
  const destination = resolve(outputPath);
  const temporary = `${destination}.${process.pid}.tmp`;
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
  try {
    await rename(temporary, destination);
  } catch (error) {
    if (error?.code !== "EEXIST" && error?.code !== "EPERM") throw error;
    await rm(destination, { force: true });
    await rename(temporary, destination);
  }
  return { inputPath: resolve(inputPath), outputPath: destination, snapshot: sanitized };
}

function defaultInputPath() {
  return resolve(homedir(), "curseforge", "minecraft", "Instances", "Create Adventures", "colonybridge", "latest", "colony-minecraft-overworld-1.json");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const inputPath = resolve(process.argv[2] ?? process.env.COLONY_BRIDGE_SNAPSHOT ?? defaultInputPath());
  const outputPath = resolve(process.argv[3] ?? resolve(projectRoot, "data", "colony-snapshot.json"));
  const result = await importSnapshot(inputPath, outputPath);
  console.log(`Imported ${result.snapshot.colony.name} from Colony Bridge schema ${result.snapshot.schemaVersion}.`);
}
