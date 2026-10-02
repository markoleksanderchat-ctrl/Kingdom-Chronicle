export interface ColonySnapshot {
  schemaVersion: number;
  bridgeVersion: string;
  generatedAt: string;
  trigger: string;
  fingerprint: string | null;
  game: Record<string, string | null>;
  world: { saveName: string | null; dimension: string | null; dedicatedServer: boolean };
  colony: {
    id: number | null;
    name: string | null;
    ownerName: string | null;
    dimension: string | null;
    claimedChunkCount: number | null;
    citizenCount: number | null;
    maxCitizenCapacity: number | null;
    overallHappiness: number | null;
    active: boolean | null;
    underAttack: boolean | null;
    raided: boolean | null;
    abandoned: boolean | null;
    state: string | null;
    flags: Record<string, unknown>;
  };
  summary: {
    citizenCount: number;
    citizenCapacity: number | null;
    employedCitizens: number;
    unemployedCitizens: number;
    children: number;
    guards: number;
    buildingCount: number;
    staffedBuildings: number;
    unstaffedBuildings: number;
    activeRequests: number;
    activeConstructionProjects: number;
  };
  citizens: Citizen[];
  buildings: Building[];
  requests: Request[];
  construction: Construction[];
  environment: {
    centerBiome: string | null;
    sampledBiomes: string[];
    gameTimeTicks: number | null;
    daylight: boolean | null;
    raining: boolean | null;
    thundering: boolean | null;
  };
  territory: {
    claimedChunks: number | null;
    approximateClaimedBlocks: number | null;
    loadedChunks: number | null;
    ticketedChunks: number | null;
  };
  livestock?: {
    total: number | null;
    housed: number | null;
    withoutHome: number | null;
    byType: Record<string, number>;
    huts?: Array<{
      buildingId: string;
      buildingType: string | null;
      name: string | null;
      position: { x: number | null; y: number | null; z: number | null } | null;
      workerIds: number[];
      total: number;
      byType: Record<string, number>;
    }>;
  };
  research: {
    completed: string[];
    inProgress: Array<{ id: string; progress: number | null }>;
    effects?: Array<{
      id: string;
      nameTranslationKey: string | null;
      subtitleTranslationKey: string | null;
      strength: number | null;
    }>;
  };
  statistics: Record<string, number>;
  recentStatistics?: {
    currentColonyDay: number | null;
    windowDays: number;
    today: Record<string, number>;
    recentWindow: Record<string, number>;
  };
  defenseStatistics?: {
    lifetime: DefenseKillBreakdown;
    today: DefenseKillBreakdown;
    recentWindow: DefenseKillBreakdown;
    currentDay: number | null;
    windowDays: number;
    animalsButchered: number;
    animalsButcheredToday: number;
    animalsButcheredRecentWindow: number;
  };
  foodSupply?: FoodSupply;
  stockLedger?: StockLedger;
  capabilities: Record<string, { supported: boolean; reason: string | null }>;
  warnings: Array<{ scope: string; code: string; message: string }>;
  errors: Array<{ scope: string; code: string; message: string }>;
}

export interface DefenseKillBreakdown {
  total: number;
  detailedTotal?: number;
  raiders: number;
  hostile: number;
  peacefulOrOther: number;
  unclassified: number;
  reconciled?: boolean;
  byEntity: Record<string, number>;
  byEntityCategory?: Record<string, "minecolonies_raider" | "monster_or_hostile" | "neutral_or_peaceful" | "unclassified">;
}

export interface StockLedger {
  currentColonyDay: number | null;
  refreshedColonyDay: number | null;
  nextRefreshColonyDay: number | null;
  cacheAgeDays: number | null;
  refreshIntervalDays: number;
  totalItems: number | null;
  distinctItemTypes: number;
  exportedItemTypes: number;
  omittedItemTypes: number;
  itemsById: Record<string, number>;
  scannedBuildings: number;
  scannedHandlers: number;
  scannedSlots: number;
  handlersByBuildingType?: Record<string, number>;
  slotsByBuildingType?: Record<string, number>;
  startupScan?: boolean;
  truncated: boolean;
}

export interface SnapshotHistoryEntry {
  generatedAt: string;
  receivedAt: string;
  snapshot: ColonySnapshot;
}

export interface FoodSupply {
  storedServings: number | null;
  distinctFoodTypes: number;
  servingsByItem: Record<string, number>;
  mealsServedToday: number | null;
  mealsServedSample: number | null;
  sampleDays: number;
  averageMealsPerDay: number | null;
  estimatedDaysRemaining: number | null;
  estimatedRunoutColonyDay: number | null;
  status: "no_dining_hall" | "menu_empty" | "learning" | "incomplete" | "critical" | "low" | "watch" | "stable" | string;
  confidence: "low" | "medium" | "high" | string;
  diningHallsScanned: number;
  menuApprovedFoodTypes: number;
  approvedMenuItems: string[];
  scannedBuildings: number;
  scannedSlots: number;
  truncated: boolean;
}

export interface Citizen {
  id: number | null;
  name: string | null;
  ageCategory: string | null;
  currentJob: string | null;
  jobRegistryId: string | null;
  guard?: boolean | null;
  happiness: number | null;
  saturation: number | null;
  activity: string | null;
  employed: boolean | null;
  child: boolean | null;
  alive: boolean | null;
  sick: boolean | null;
  injured: boolean | null;
  sleeping: boolean | null;
  idle: boolean | null;
  working: boolean | null;
  requestingItem: boolean | null;
  workplaceBuildingId?: string | null;
  homeBuildingId?: string | null;
  details: Record<string, unknown>;
}

export interface Building {
  id: string | null;
  registryId: string | null;
  type: string | null;
  level: number | null;
  assignedWorkerIds: number[];
  workplaceWorkerIds?: number[];
  staffed: boolean | null;
  active: boolean | null;
  upgrading: boolean | null;
  beingBuilt: boolean | null;
  structurallyComplete: boolean | null;
}

export interface Request {
  id: string | null;
  requestingCitizenId: number | null;
  requestedItemRegistryId: string | null;
  requestedItemDisplayName: string | null;
  requestedQuantity: number | null;
  remainingQuantity: number | null;
  state: string | null;
  details: Record<string, unknown>;
}

export interface Construction {
  buildingId: string | null;
  projectType: string | null;
  currentLevel: number | null;
  targetLevel: number | null;
  assignedBuilderCitizenId: number | null;
  builderHutId: string | null;
  projectState: string | null;
  progress: number | null;
  details: Record<string, unknown>;
}
