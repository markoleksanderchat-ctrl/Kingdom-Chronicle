import type { ColonySnapshot } from "@/lib/colony-schema";
import { SUPPORTED_SNAPSHOT_SCHEMA } from "./runtime-contract.ts";

export { MAX_SNAPSHOT_BYTES } from "./runtime-contract.ts";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const finiteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const integer = (value: unknown): value is number => Number.isInteger(value);
const nullableNumber = (value: unknown) => value === null || finiteNumber(value);
const nullableInteger = (value: unknown) => value === null || integer(value);
const nullableString = (value: unknown) => value === null || typeof value === "string";
const nullableBoolean = (value: unknown) => value === null || typeof value === "boolean";
const stringArray = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string");
const integerArray = (value: unknown) => Array.isArray(value) && value.every(integer);

function numberRecord(value: unknown) {
  return record(value) && Object.values(value).every(finiteNumber);
}

function nullableStringRecord(value: unknown) {
  return record(value) && Object.values(value).every((item) => nullableString(item));
}

function validColony(value: unknown) {
  return record(value)
    && nullableInteger(value.id)
    && nullableString(value.name)
    && nullableString(value.ownerName)
    && nullableString(value.dimension)
    && nullableInteger(value.claimedChunkCount)
    && nullableInteger(value.citizenCount)
    && nullableInteger(value.maxCitizenCapacity)
    && nullableNumber(value.overallHappiness)
    && nullableBoolean(value.active)
    && nullableBoolean(value.underAttack)
    && nullableBoolean(value.raided)
    && nullableBoolean(value.abandoned)
    && nullableString(value.state)
    && record(value.flags);
}

function validSummary(value: unknown) {
  if (!record(value)) return false;
  const requiredCounts = [
    "citizenCount", "employedCitizens", "unemployedCitizens", "children", "guards",
    "buildingCount", "staffedBuildings", "unstaffedBuildings", "activeRequests", "activeConstructionProjects",
  ];
  return requiredCounts.every((key) => integer(value[key]) && (value[key] as number) >= 0)
    && nullableInteger(value.citizenCapacity)
    && (value.citizenCapacity === null || value.citizenCapacity >= 0);
}

function validCitizen(value: unknown) {
  return record(value)
    && nullableInteger(value.id)
    && nullableString(value.name)
    && nullableString(value.ageCategory)
    && nullableString(value.currentJob)
    && nullableString(value.jobRegistryId)
    && (value.guard === undefined || nullableBoolean(value.guard))
    && nullableNumber(value.happiness)
    && nullableNumber(value.saturation)
    && nullableString(value.activity)
    && nullableBoolean(value.employed)
    && nullableBoolean(value.child)
    && nullableBoolean(value.alive)
    && nullableBoolean(value.sick)
    && nullableBoolean(value.injured)
    && nullableBoolean(value.sleeping)
    && nullableBoolean(value.idle)
    && nullableBoolean(value.working)
    && nullableBoolean(value.requestingItem)
    && (value.workplaceBuildingId === undefined || nullableString(value.workplaceBuildingId))
    && (value.homeBuildingId === undefined || nullableString(value.homeBuildingId))
    && record(value.details);
}

function validBuilding(value: unknown) {
  return record(value)
    && nullableString(value.id)
    && nullableString(value.registryId)
    && nullableString(value.type)
    && nullableInteger(value.level)
    && integerArray(value.assignedWorkerIds)
    && (value.workplaceWorkerIds === undefined || integerArray(value.workplaceWorkerIds))
    && nullableBoolean(value.staffed)
    && nullableBoolean(value.active)
    && nullableBoolean(value.upgrading)
    && nullableBoolean(value.beingBuilt)
    && nullableBoolean(value.structurallyComplete);
}

function validRequest(value: unknown) {
  return record(value)
    && nullableString(value.id)
    && nullableInteger(value.requestingCitizenId)
    && nullableString(value.requestedItemRegistryId)
    && nullableString(value.requestedItemDisplayName)
    && nullableNumber(value.requestedQuantity)
    && nullableNumber(value.remainingQuantity)
    && nullableString(value.state)
    && record(value.details);
}

function validConstruction(value: unknown) {
  return record(value)
    && nullableString(value.buildingId)
    && nullableString(value.projectType)
    && nullableInteger(value.currentLevel)
    && nullableInteger(value.targetLevel)
    && nullableInteger(value.assignedBuilderCitizenId)
    && nullableString(value.builderHutId)
    && nullableString(value.projectState)
    && nullableNumber(value.progress)
    && record(value.details);
}

function validEnvironment(value: unknown) {
  return record(value)
    && nullableString(value.centerBiome)
    && stringArray(value.sampledBiomes)
    && nullableNumber(value.gameTimeTicks)
    && nullableBoolean(value.daylight)
    && nullableBoolean(value.raining)
    && nullableBoolean(value.thundering);
}

function validTerritory(value: unknown) {
  return record(value)
    && nullableInteger(value.claimedChunks)
    && nullableNumber(value.approximateClaimedBlocks)
    && nullableInteger(value.loadedChunks)
    && nullableInteger(value.ticketedChunks);
}

function validResearch(value: unknown) {
  return record(value)
    && stringArray(value.completed)
    && Array.isArray(value.inProgress)
    && value.inProgress.every((item) => record(item) && typeof item.id === "string" && nullableNumber(item.progress))
    && (value.effects === undefined || Array.isArray(value.effects) && value.effects.every((item) => (
      record(item)
      && typeof item.id === "string"
      && nullableString(item.nameTranslationKey)
      && nullableString(item.subtitleTranslationKey)
      && nullableNumber(item.strength)
    )));
}

function validCapabilities(value: unknown) {
  return record(value) && Object.values(value).every((item) => (
    record(item) && typeof item.supported === "boolean" && nullableString(item.reason)
  ));
}

function validIssues(value: unknown) {
  return Array.isArray(value) && value.every((item) => (
    record(item) && typeof item.scope === "string" && typeof item.code === "string" && typeof item.message === "string"
  ));
}

function validLivestock(value: unknown) {
  return record(value)
    && nullableInteger(value.total)
    && nullableInteger(value.housed)
    && nullableInteger(value.withoutHome)
    && numberRecord(value.byType)
    && (value.huts === undefined || Array.isArray(value.huts) && value.huts.every((hut) => (
      record(hut)
      && typeof hut.buildingId === "string"
      && nullableString(hut.buildingType)
      && nullableString(hut.name)
      && (hut.position === null || record(hut.position)
        && nullableInteger(hut.position.x)
        && nullableInteger(hut.position.y)
        && nullableInteger(hut.position.z))
      && Array.isArray(hut.workerIds)
      && hut.workerIds.every(integer)
      && integer(hut.total)
      && numberRecord(hut.byType)
    )));
}

function validRecentStatistics(value: unknown) {
  return record(value)
    && nullableInteger(value.currentColonyDay)
    && integer(value.windowDays)
    && value.windowDays > 0
    && numberRecord(value.today)
    && numberRecord(value.recentWindow);
}

function validDefenseBreakdown(value: unknown) {
  return record(value)
    && [value.total, value.raiders, value.hostile, value.peacefulOrOther, value.unclassified]
      .every((item) => integer(item) && item >= 0)
    && (value.detailedTotal === undefined || integer(value.detailedTotal) && value.detailedTotal >= 0)
    && (value.reconciled === undefined || typeof value.reconciled === "boolean")
    && numberRecord(value.byEntity)
    && (value.byEntityCategory === undefined || record(value.byEntityCategory)
      && Object.values(value.byEntityCategory).every((category) => [
        "minecolonies_raider", "monster_or_hostile", "neutral_or_peaceful", "unclassified",
      ].includes(String(category))));
}

function validDefenseStatistics(value: unknown) {
  return record(value)
    && validDefenseBreakdown(value.lifetime)
    && validDefenseBreakdown(value.today)
    && validDefenseBreakdown(value.recentWindow)
    && nullableInteger(value.currentDay)
    && integer(value.windowDays) && value.windowDays > 0
    && integer(value.animalsButchered) && value.animalsButchered >= 0
    && integer(value.animalsButcheredToday) && value.animalsButcheredToday >= 0
    && integer(value.animalsButcheredRecentWindow) && value.animalsButcheredRecentWindow >= 0;
}

function validFoodSupply(value: unknown) {
  return record(value)
    && nullableNumber(value.storedServings)
    && integer(value.distinctFoodTypes)
    && numberRecord(value.servingsByItem)
    && nullableNumber(value.mealsServedToday)
    && nullableNumber(value.mealsServedSample)
    && finiteNumber(value.sampleDays)
    && nullableNumber(value.averageMealsPerDay)
    && nullableNumber(value.estimatedDaysRemaining)
    && nullableNumber(value.estimatedRunoutColonyDay)
    && typeof value.status === "string"
    && typeof value.confidence === "string"
    && integer(value.diningHallsScanned)
    && integer(value.menuApprovedFoodTypes)
    && stringArray(value.approvedMenuItems)
    && integer(value.scannedBuildings)
    && integer(value.scannedSlots)
    && typeof value.truncated === "boolean";
}

function validStockLedger(value: unknown) {
  return record(value)
    && nullableInteger(value.currentColonyDay)
    && nullableInteger(value.refreshedColonyDay)
    && nullableInteger(value.nextRefreshColonyDay)
    && nullableInteger(value.cacheAgeDays)
    && integer(value.refreshIntervalDays)
    && nullableNumber(value.totalItems)
    && integer(value.distinctItemTypes)
    && integer(value.exportedItemTypes)
    && integer(value.omittedItemTypes)
    && numberRecord(value.itemsById)
    && integer(value.scannedBuildings)
    && integer(value.scannedHandlers)
    && integer(value.scannedSlots)
    && (value.handlersByBuildingType === undefined || numberRecord(value.handlersByBuildingType))
    && (value.slotsByBuildingType === undefined || numberRecord(value.slotsByBuildingType))
    && (value.startupScan === undefined || typeof value.startupScan === "boolean")
    && typeof value.truncated === "boolean";
}

export function isColonySnapshot(value: unknown): value is ColonySnapshot {
  if (!record(value)) return false;
  const generatedAt = typeof value.generatedAt === "string" ? Date.parse(value.generatedAt) : Number.NaN;
  return value.schemaVersion === SUPPORTED_SNAPSHOT_SCHEMA
    && typeof value.bridgeVersion === "string" && value.bridgeVersion.length > 0
    && Number.isFinite(generatedAt)
    && typeof value.trigger === "string" && value.trigger.length > 0
    && (value.fingerprint === null || typeof value.fingerprint === "string")
    && nullableStringRecord(value.game)
    && record(value.world)
    && nullableString(value.world.saveName)
    && nullableString(value.world.dimension)
    && typeof value.world.dedicatedServer === "boolean"
    && validColony(value.colony)
    && validSummary(value.summary)
    && Array.isArray(value.citizens) && value.citizens.every(validCitizen)
    && Array.isArray(value.buildings) && value.buildings.every(validBuilding)
    && Array.isArray(value.requests) && value.requests.every(validRequest)
    && Array.isArray(value.construction) && value.construction.every(validConstruction)
    && validEnvironment(value.environment)
    && validTerritory(value.territory)
    && (value.livestock === undefined || validLivestock(value.livestock))
    && validResearch(value.research)
    && numberRecord(value.statistics)
    && (value.recentStatistics === undefined || validRecentStatistics(value.recentStatistics))
    && (value.defenseStatistics === undefined || validDefenseStatistics(value.defenseStatistics))
    && (value.foodSupply === undefined || validFoodSupply(value.foodSupply))
    && (value.stockLedger === undefined || validStockLedger(value.stockLedger))
    && validCapabilities(value.capabilities)
    && validIssues(value.warnings)
    && validIssues(value.errors);
}
