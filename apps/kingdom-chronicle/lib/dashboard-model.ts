import { assessRaidReadiness, type RaidReadiness } from "./raid";
import { buildingName, identifierName } from "./colony";
import type { Building, Citizen, ColonySnapshot, SnapshotHistoryEntry } from "./colony-schema";
import { selectBuildings } from "./selectors/buildings";
import { selectCitizens } from "./selectors/citizens";
import { selectFood } from "./selectors/food";
import { signedDelta } from "./selectors/history";
import { selectResearch } from "./selectors/research";
import { selectStatistics } from "./selectors/statistics";
import { filterStock, selectStock, selectStockHistory } from "./selectors/stock";

type LivestockHut = NonNullable<NonNullable<ColonySnapshot["livestock"]>["huts"]>[number];
type LivestockHutModel = LivestockHut & { sortedByType: Array<[string, number]> };

export interface DashboardModel {
  snapshot: ColonySnapshot;
  colony: ColonySnapshot["colony"];
  summary: ColonySnapshot["summary"];
  citizens: ColonySnapshot["citizens"];
  construction: ColonySnapshot["construction"];
  requests: ColonySnapshot["requests"];
  environment: ColonySnapshot["environment"];
  territory: ColonySnapshot["territory"];
  research: ColonySnapshot["research"];
  citizenById: ReadonlyMap<number, Citizen>;
  reconciledBuildings: Building[];
  activeWorkplaces: number;
  lowMorale: Citizen[];
  lowMoraleHighlights: Citizen[];
  unhealthy: Citizen[];
  colonyDay: number | null;
  worldAgeDays: number | null;
  structurePack: string;
  centerBiome: string;
  managedChunks: number | null;
  worldStatus: string;
  capacityPercent: number | null;
  employmentPercent: number;
  raidActive: boolean;
  raidStatusKnown: boolean;
  headline: string;
  sortedBuildings: Building[];
  visibleBuildings: Building[];
  buildingCounts: { housing: number; couriers: number; builders: number; attention: number };
  completedResearch: string[];
  researchEffects: NonNullable<ColonySnapshot["research"]["effects"]>;
  researchBenefits: Array<{ id: string; summary: { title: string; description: string; value: string } }>;
  livestock: ColonySnapshot["livestock"];
  livestockHuts: LivestockHutModel[];
  needsTreatment: Citizen[];
  hospitalized: Citizen[];
  outsideHospitalCount: number;
  recentStatistics: ColonySnapshot["recentStatistics"];
  defenseStatistics: ColonySnapshot["defenseStatistics"];
  lifetimeDefenseDetail: number;
  defenseCoverage: number;
  defensiveKillsByEntity: Array<[string, number]>;
  foodSupply: ColonySnapshot["foodSupply"];
  topFoods: Array<[string, number]>;
  menuFoods: string[];
  missingMenuFoods: string[];
  recentKeys: string[];
  visibleRecentKeys: string[];
  mealWindowDifference: number;
  raidExpectedTonight: boolean;
  raidCanStart: boolean;
  raidsEnabled: boolean;
  expectedRaiderCount: number | null;
  raidForecast: string;
  raidReadiness: RaidReadiness;
  hasAttention: boolean;
  stockLedger: ColonySnapshot["stockLedger"];
  normalizedStockQuery: string;
  stockItems: Array<[string, number]>;
  matchingStockItems: Array<readonly [string, number]>;
  visibleStockItems: Array<readonly [string, number]>;
  friendlyNameCounts: ReadonlyMap<string, number>;
  attentionCitizens: Citizen[];
  visibleCitizens: Citizen[];
  previousEntry: SnapshotHistoryEntry | undefined;
  previousSnapshot: ColonySnapshot | undefined;
  happinessDelta: string | null;
  lowMoraleDelta: string | null;
  stockTotalDelta: string | null;
  foodReserveDelta: string | null;
  foodRunwayDelta: string | null;
  previousItems: Record<string, number> | undefined;
  stockChanges: Array<{ item: string; delta: number }>;
  stockCoverageChanged: boolean;
  availableCapabilities: number;
  totalCapabilities: number;
  unsupportedCapabilities: string[];
  nearbyBiomes: string[];
  allCitizensByAttention: Citizen[];
  visibleStats: string[];
  tabCounts: Partial<Record<"overview" | "projects" | "citizens" | "buildings" | "realm" | "records", number>>;
}

type BaseDashboardModel = Omit<DashboardModel,
  "visibleBuildings" | "visibleCitizens" | "normalizedStockQuery" | "matchingStockItems" | "visibleStockItems"
  | "previousEntry" | "previousSnapshot" | "happinessDelta" | "lowMoraleDelta" | "stockTotalDelta"
  | "foodReserveDelta" | "foodRunwayDelta" | "previousItems" | "stockChanges" | "stockCoverageChanged"
  | "visibleRecentKeys">;

const baseModelCache = new WeakMap<ColonySnapshot, BaseDashboardModel>();

function buildBaseModel(snapshot: ColonySnapshot): BaseDashboardModel {
  const cached = baseModelCache.get(snapshot);
  if (cached) return cached;
  const { colony, summary, citizens, buildings, construction, requests, environment, territory, research } = snapshot;
  const selectedCitizens = selectCitizens(citizens);
  const selectedBuildings = selectBuildings(buildings, citizens, summary.citizenCount, buildingName);
  const selectedResearch = selectResearch(research);
  const selectedStatistics = selectStatistics(snapshot);
  const selectedFood = selectFood(snapshot.foodSupply);
  const selectedStock = selectStock(snapshot.stockLedger);
  const livestockHuts = [...(snapshot.livestock?.huts ?? [])].sort((left, right) =>
    (right.total ?? 0) - (left.total ?? 0)
    || (left.name ?? left.buildingType ?? left.buildingId).localeCompare(right.name ?? right.buildingType ?? right.buildingId))
    .map((hut) => ({ ...hut, sortedByType: Object.entries(hut.byType)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])) }));
  const raidActive = colony.underAttack === true || colony.raided === true;
  const raidStatusKnown = typeof colony.underAttack === "boolean" && typeof colony.raided === "boolean";
  const raidExpectedTonight = colony.flags.raidExpectedTonight === true;
  const raidCanStart = colony.flags.raidCanStart === true;
  const raidsEnabled = colony.flags.raidsEnabled !== false;
  const expectedRaiderCount = typeof colony.flags.expectedRaiderCount === "number" ? colony.flags.expectedRaiderCount : null;
  const raidForecast = raidActive ? "Raid active" : !raidStatusKnown ? "Raid status unavailable"
    : raidExpectedTonight ? "Raid expected tonight" : !raidsEnabled ? "Raids disabled"
      : raidCanStart ? "Raid conditions met" : "Peaceful";
  const raidReadiness = assessRaidReadiness(snapshot);
  const capacityPercent = summary.citizenCapacity && summary.citizenCapacity > 0
    ? summary.citizenCount / summary.citizenCapacity * 100 : null;
  const model: BaseDashboardModel = {
    snapshot, colony, summary, citizens, construction, requests, environment, territory, research,
    citizenById: selectedCitizens.byId,
    reconciledBuildings: selectedBuildings.reconciled,
    activeWorkplaces: selectedBuildings.activeWorkplaces,
    lowMorale: selectedCitizens.lowMorale,
    lowMoraleHighlights: selectedCitizens.lowMorale.slice(0, 4),
    unhealthy: selectedCitizens.unhealthy,
    colonyDay: typeof colony.flags.day === "number" ? colony.flags.day : null,
    worldAgeDays: environment.gameTimeTicks == null ? null : Math.floor(environment.gameTimeTicks / 24000),
    structurePack: typeof colony.flags.structurePack === "string" ? colony.flags.structurePack : "Unknown style",
    centerBiome: identifierName(environment.centerBiome),
    managedChunks: territory.claimedChunks ?? territory.ticketedChunks ?? colony.claimedChunkCount,
    worldStatus: ["shutdown", "disconnect"].includes(snapshot.trigger) ? "World closed" : "Latest report",
    capacityPercent,
    employmentPercent: summary.citizenCount ? summary.employedCitizens / summary.citizenCount * 100 : 0,
    raidActive,
    raidStatusKnown,
    headline: raidActive ? "The colony is under pressure."
      : summary.citizenCapacity && summary.citizenCount >= summary.citizenCapacity
        ? "Stable, productive, and at capacity." : "Stable, productive, and growing.",
    sortedBuildings: selectedBuildings.sorted,
    buildingCounts: selectedBuildings.counts,
    completedResearch: selectedResearch.completed,
    researchEffects: selectedResearch.effects,
    researchBenefits: selectedResearch.benefits,
    livestock: snapshot.livestock,
    livestockHuts,
    needsTreatment: selectedCitizens.needsTreatment,
    hospitalized: selectedCitizens.hospitalized,
    outsideHospitalCount: selectedCitizens.needsTreatment.length - selectedCitizens.hospitalized.length,
    recentStatistics: selectedStatistics.recent,
    defenseStatistics: selectedStatistics.defense,
    lifetimeDefenseDetail: selectedStatistics.lifetimeDefenseDetail,
    defenseCoverage: selectedStatistics.defenseCoverage,
    defensiveKillsByEntity: selectedStatistics.defensiveKillsByEntity,
    foodSupply: snapshot.foodSupply,
    topFoods: selectedFood.topFoods,
    menuFoods: selectedFood.menuFoods,
    missingMenuFoods: selectedFood.missingMenuFoods,
    recentKeys: selectedStatistics.recentKeys,
    mealWindowDifference: snapshot.foodSupply?.mealsServedSample != null && snapshot.recentStatistics?.recentWindow.food_served != null
      ? snapshot.foodSupply.mealsServedSample - snapshot.recentStatistics.recentWindow.food_served : 0,
    raidExpectedTonight, raidCanStart, raidsEnabled, expectedRaiderCount, raidForecast, raidReadiness,
    hasAttention: capacityPercent != null && capacityPercent >= 100 || raidReadiness.totalGuards === 0
      || selectedCitizens.lowMorale.length > 0 || summary.unemployedCitizens > 0 || raidActive
      || Boolean(snapshot.foodSupply && ["critical", "low", "watch"].includes(snapshot.foodSupply.status)),
    stockLedger: snapshot.stockLedger,
    stockItems: selectedStock.items,
    friendlyNameCounts: selectedStock.friendlyNameCounts,
    attentionCitizens: selectedCitizens.attention,
    allCitizensByAttention: selectedCitizens.allByAttention,
    availableCapabilities: Object.values(snapshot.capabilities).filter((capability) => capability.supported).length,
    totalCapabilities: Object.keys(snapshot.capabilities).length,
    unsupportedCapabilities: Object.entries(snapshot.capabilities).filter(([, capability]) => !capability.supported)
      .map(([name]) => name),
    nearbyBiomes: environment.sampledBiomes.filter((biome) => biome !== environment.centerBiome),
    visibleStats: selectedStatistics.visibleStats,
    tabCounts: { projects: construction.length, citizens: citizens.length, buildings: selectedBuildings.reconciled.length },
  };
  baseModelCache.set(snapshot, model);
  return model;
}

export function buildDashboardModel(snapshot: ColonySnapshot, history: readonly SnapshotHistoryEntry[],
                                    stockQuery: string): DashboardModel {
  const base = buildBaseModel(snapshot);
  const previousEntry = history.find((entry) => entry.generatedAt !== snapshot.generatedAt);
  const previousSnapshot = previousEntry?.snapshot;
  const stockHistory = selectStockHistory(snapshot.stockLedger, previousSnapshot?.stockLedger);
  const filteredStock = filterStock(base.stockItems, stockQuery);
  return {
    ...base,
    visibleBuildings: base.sortedBuildings,
    visibleCitizens: base.allCitizensByAttention,
    normalizedStockQuery: filteredStock.normalizedQuery,
    matchingStockItems: filteredStock.matching,
    visibleStockItems: filteredStock.visible,
    previousEntry,
    previousSnapshot,
    happinessDelta: signedDelta(snapshot.colony.overallHappiness, previousSnapshot?.colony.overallHappiness, 1),
    lowMoraleDelta: signedDelta(base.lowMorale.length,
      previousSnapshot?.citizens.filter((citizen) => citizen.happiness != null && citizen.happiness < 6).length),
    stockTotalDelta: signedDelta(snapshot.stockLedger?.totalItems, previousSnapshot?.stockLedger?.totalItems),
    foodReserveDelta: signedDelta(snapshot.foodSupply?.storedServings, previousSnapshot?.foodSupply?.storedServings),
    foodRunwayDelta: signedDelta(snapshot.foodSupply?.estimatedDaysRemaining,
      previousSnapshot?.foodSupply?.estimatedDaysRemaining, 1),
    previousItems: stockHistory.previousItems,
    stockChanges: stockHistory.changes,
    stockCoverageChanged: stockHistory.coverageChanged,
    visibleRecentKeys: base.recentKeys,
  };
}
