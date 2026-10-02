import type { Building, Citizen } from "../colony-schema";

export function reconcileBuildingStaffing(buildings: readonly Building[], citizens: readonly Citizen[], reportedCitizenCount: number) {
  const workersByBuilding = new Map<string, number[]>();
  citizens.forEach((citizen) => {
    if (citizen.id == null || !citizen.workplaceBuildingId) return;
    const workers = workersByBuilding.get(citizen.workplaceBuildingId) ?? [];
    workers.push(citizen.id);
    workersByBuilding.set(citizen.workplaceBuildingId, workers);
  });
  const rosterComplete = citizens.length === reportedCitizenCount;
  return buildings.map((building) => {
    const derivedWorkers = building.id ? workersByBuilding.get(building.id) ?? [] : [];
    const workplaceWorkerIds = rosterComplete ? derivedWorkers : building.workplaceWorkerIds ?? derivedWorkers;
    return { ...building, workplaceWorkerIds, staffed: rosterComplete ? workplaceWorkerIds.length > 0 : building.staffed };
  });
}

export function selectBuildingGroup(building: Building) {
  const path = building.registryId?.split(":").at(-1) ?? "unknown";
  if (["residence", "tavern"].includes(path)) return "Housing";
  if (["warehouse", "deliveryman", "postbox", "stash"].includes(path)) return "Logistics";
  if (["cook", "kitchen", "farm", "fisherman"].includes(path)) return "Food";
  if (["lumberjack", "sawmill", "stonemason", "mine"].includes(path)) return "Materials";
  if (["university", "library"].includes(path)) return "Education";
  if (path === "blacksmith") return "Crafting";
  if (path === "hospital") return "Health";
  if (path === "builder") return "Construction";
  return "Civic";
}

export function selectBuildingState(building: Building) {
  const path = building.registryId?.split(":").at(-1) ?? "unknown";
  if (building.beingBuilt || building.upgrading) return "Upgrading";
  if (building.level === 0 || building.structurallyComplete === false) return "Unbuilt";
  if (["postbox", "stash"].includes(path)) return "Utility";
  if (path === "townhall") return "Operational";
  if (path === "residence") return `${building.assignedWorkerIds.length} residents`;
  if (path === "tavern") return `${building.assignedWorkerIds.length} occupants`;
  return building.staffed ? "Staffed" : "Unstaffed";
}

export function selectBuildingPeopleIds(building: Building) {
  const path = building.registryId?.split(":").at(-1) ?? "unknown";
  return ["residence", "tavern"].includes(path)
    ? building.assignedWorkerIds
    : building.workplaceWorkerIds ?? building.assignedWorkerIds;
}

export function selectBuildings(buildings: readonly Building[], citizens: readonly Citizen[], reportedCitizenCount: number,
                                name: (building: Building) => string) {
  const reconciled = reconcileBuildingStaffing(buildings, citizens, reportedCitizenCount);
  const sorted = [...reconciled].sort((left, right) => selectBuildingGroup(left).localeCompare(selectBuildingGroup(right))
    || name(left).localeCompare(name(right)) || (right.level ?? 0) - (left.level ?? 0));
  return {
    reconciled,
    sorted,
    activeWorkplaces: reconciled.filter((building) => building.staffed).length,
    counts: {
      housing: reconciled.filter((building) => selectBuildingGroup(building) === "Housing").length,
      couriers: reconciled.filter((building) => building.registryId?.endsWith(":deliveryman")).length,
      builders: reconciled.filter((building) => building.registryId?.endsWith(":builder")).length,
      attention: reconciled.filter((building) => ["Unstaffed", "Unbuilt", "Utility"].includes(selectBuildingState(building))).length,
    },
  };
}
