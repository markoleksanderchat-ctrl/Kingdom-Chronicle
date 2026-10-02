import type { Building, Citizen } from "./colony-schema";
import { selectBuildingGroup, selectBuildingPeopleIds, selectBuildingState } from "./selectors/buildings";

export type {
  Building,
  Citizen,
  ColonySnapshot,
  Construction,
  DefenseKillBreakdown,
  FoodSupply,
  Request,
  SnapshotHistoryEntry,
  StockLedger,
} from "./colony-schema";

const names: Record<string, string> = {
  deliveryman: "Courier",
  fisherman: "Fisher",
  lumberjack: "Forester",
  residence: "Residence",
  cook: "Restaurant",
  builder: "Builder's Hut",
  hospital: "Hospital",
  university: "University",
  townhall: "Town Hall",
  stonemason: "Stonemason",
  postbox: "Postbox",
  guardtower: "Guard Tower",
  concretemixer: "Concrete Mixer",
};

const researchNames: Record<string, string> = {
  assistanthammers: "Professional Assistant",
  biodegradable: "Biodegradable",
  hittingiron: "Hitting Iron",
  hot: "Hot",
  softshoes: "Soft Shoes",
  stamina: "Stamina",
  stonecake: "Stone Cake",
  theflintstones: "The Flintstones",
  woodwork: "Woodwork",
};

export function identifierName(value: string | null | undefined) {
  if (!value) return "Unknown";
  const path = value.split(/[/:.]/).at(-1) ?? value;
  if (names[path]) return names[path];
  return path.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function researchName(value: string | null | undefined) {
  if (!value) return "Unknown research";
  const path = value.split(/[/:.]/).at(-1) ?? value;
  return researchNames[path.toLowerCase()] ?? identifierName(path);
}

export function roleName(citizen: Citizen) {
  if (!citizen.jobRegistryId) return citizen.child ? "Child" : "Unemployed";
  const path = citizen.jobRegistryId.split(":").at(-1) ?? citizen.jobRegistryId;
  const roles: Record<string, string> = {
    builder: "Builder",
    cook: "Cook",
    deliveryman: "Courier",
    fisherman: "Fisher",
    lumberjack: "Forester",
    sawmill: "Carpenter",
    stonesmeltery: "Stone Smelter",
  };
  return roles[path] ?? identifierName(citizen.jobRegistryId);
}

const defensiveJobs = new Set(["knight", "ranger", "druid", "guard"]);

export function isGuardCitizen(citizen: Pick<Citizen, "guard" | "jobRegistryId">) {
  if (typeof citizen.guard === "boolean") return citizen.guard;
  const path = citizen.jobRegistryId?.split(":").at(-1)?.toLowerCase();
  return path != null && defensiveJobs.has(path);
}

export { reconcileBuildingStaffing } from "./selectors/buildings";

export function activityName(activity: string | null) {
  const key = activity?.split(".").at(-1) ?? "unknown";
  const known: Record<string, string> = {
    delivery: "Delivering",
    farmer: "Farming",
    idle: "Idle",
    lumberjack_search: "Searching",
    rain: "Sheltering",
    sawmill: "Working",
    working: "Working",
  };
  return known[key] ?? identifierName(key);
}

export function citizenStatus(citizen: Citizen) {
  if (citizen.alive === false) return "Deceased";
  if (citizen.sick) return "Sick";
  if (citizen.injured) return "Injured";
  if (citizen.sleeping) return "Sleeping";
  if (citizen.requestingItem) return "Waiting for an item";
  if (citizen.idle || citizen.details.jobIdling === true) return "Idle";
  if (citizen.working === true) return activityName(citizen.activity);
  return activityName(citizen.activity);
}

export function itemSource(itemId: string) {
  const namespace = itemId.split(":", 1)[0] ?? "unknown";
  const known: Record<string, string> = {
    minecraft: "Minecraft",
    minecolonies: "MineColonies",
    farmersdelight: "Farmer's Delight",
    domum_ornamentum: "Domum Ornamentum",
    create: "Create",
  };
  return known[namespace] ?? identifierName(namespace);
}

export function buildingName(building: Building) {
  return identifierName(building.registryId ?? building.type);
}

export function buildingGroup(building: Building) {
  return selectBuildingGroup(building);
}

export function buildingState(building: Building) {
  return selectBuildingState(building);
}

export function buildingPeopleIds(building: Building) {
  return selectBuildingPeopleIds(building);
}

export function formatSnapshotTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "Unknown";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}
