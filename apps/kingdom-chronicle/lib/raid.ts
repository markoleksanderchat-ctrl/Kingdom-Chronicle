import type { Building, ColonySnapshot } from "@/lib/colony-schema";
import { isGuardCitizen } from "@/lib/colony";

export interface RaidReadiness {
  label: string;
  tone: "safe" | "ready" | "watch" | "danger";
  score: number | null;
  totalGuards: number;
  availableGuards: number;
  unavailableGuards: number;
  expectedRaiders: number | null;
  forceRatio: number | null;
  populationBaseline: number;
  recommendedGuards: number;
  coverageRatio: number;
  defensivePosts: number;
  staffedDefensivePosts: number;
  medicalStatus: string;
  confidence: "Low" | "Limited" | "Moderate";
  confidenceDetail: string;
  actions: string[];
}

function buildingKind(building: Building) {
  return (building.registryId ?? building.type ?? "").split(":").at(-1)?.toLowerCase() ?? "";
}

function isDefensivePost(building: Building) {
  return ["guardtower", "barracks", "barrackstower"].includes(buildingKind(building))
    && building.structurallyComplete !== false;
}

export function assessRaidReadiness(snapshot: ColonySnapshot): RaidReadiness {
  const { colony, summary, citizens, buildings } = snapshot;
  const raidsEnabled = colony.flags.raidsEnabled !== false;
  const expectedRaiders = typeof colony.flags.expectedRaiderCount === "number"
    ? Math.max(0, colony.flags.expectedRaiderCount)
    : null;
  const knownDefenders = citizens.filter(isGuardCitizen);
  const detailedRosterComplete = citizens.length === summary.citizenCount;
  const totalGuards = detailedRosterComplete ? knownDefenders.length : Math.max(summary.guards, knownDefenders.length);
  const unavailableGuards = knownDefenders.filter((citizen) => citizen.alive === false || citizen.sick || citizen.injured).length;
  const knownAvailableGuards = knownDefenders.length - unavailableGuards;
  const availableGuards = knownDefenders.length > 0 || detailedRosterComplete ? knownAvailableGuards : totalGuards;
  const hospital = buildings.find((building) => buildingKind(building) === "hospital" && building.structurallyComplete !== false);
  const medicalStatus = !hospital ? "No completed Hospital" : hospital.staffed ? "Staffed Hospital" : "Hospital unstaffed";
  const posts = buildings.filter(isDefensivePost);
  const staffedDefensivePosts = posts.filter((building) => building.staffed).length;
  const forceRatio = expectedRaiders != null && expectedRaiders > 0 ? availableGuards / expectedRaiders : null;

  // This is a transparent planning baseline, not a MineColonies requirement:
  // one available guard per five residents, raised to at least the current raid estimate.
  const populationBaseline = Math.max(1, Math.ceil(summary.citizenCount / 5));
  const recommendedGuards = Math.max(populationBaseline, Math.ceil(expectedRaiders ?? 0));
  const coverageRatio = recommendedGuards > 0 ? availableGuards / recommendedGuards : 0;
  const confidence: RaidReadiness["confidence"] = !detailedRosterComplete && expectedRaiders == null
    ? "Low"
    : !detailedRosterComplete || expectedRaiders == null
      ? "Limited"
      : "Moderate";
  const confidenceDetail = confidence === "Moderate"
    ? "Roster and raid estimate available; equipment, guard levels, tower layout, and terrain are not."
    : confidence === "Limited"
      ? "One major input is incomplete, and combat equipment and positioning are not exported."
      : "Guard roster and threat estimate are incomplete; use this only as a staffing warning.";

  if (!raidsEnabled) {
    return {
      label: "Raids disabled", tone: "safe", score: null, totalGuards, availableGuards, unavailableGuards,
      expectedRaiders, forceRatio, populationBaseline, recommendedGuards, coverageRatio,
      defensivePosts: posts.length, staffedDefensivePosts, medicalStatus, confidence, confidenceDetail,
      actions: ["No defensive action is required while raids remain disabled."],
    };
  }

  // Actual defenders dominate the index. Medical support can improve recovery, but it cannot
  // turn a thin guard roster into a strong defense. Coverage gates enforce that distinction.
  const coveragePoints = Math.min(65, coverageRatio * 65);
  const availabilityPoints = totalGuards === 0 ? 0 : availableGuards / totalGuards * 20;
  const recoveryPoints = !hospital ? 0 : hospital.staffed ? 15 : 7;
  let score = Math.round(Math.max(0, Math.min(100, coveragePoints + availabilityPoints + recoveryPoints)));
  if (availableGuards === 0) score = Math.min(score, 19);
  else if (coverageRatio < 0.5) score = Math.min(score, 49);
  else if (coverageRatio < 0.75) score = Math.min(score, 64);
  else if (coverageRatio < 1) score = Math.min(score, 79);

  const raidActive = colony.underAttack === true || colony.raided === true;
  const outmatched = expectedRaiders != null && expectedRaiders > availableGuards;
  const label = availableGuards === 0
    ? "No active defense"
    : raidActive && outmatched
      ? "Outmatched now"
      : outmatched
        ? "Threat exceeds guards"
        : coverageRatio < 0.5
          ? "Thin guard coverage"
          : coverageRatio < 0.75
            ? "Building coverage"
            : coverageRatio < 1
              ? "Nearly staffed"
              : unavailableGuards > 0
                ? "Reduced strength"
                : "Prepared watch";
  const tone: RaidReadiness["tone"] = availableGuards === 0 || raidActive && outmatched
    ? "danger"
    : coverageRatio < 0.75 || outmatched
      ? "watch"
      : "ready";

  const actions: string[] = [];
  if (totalGuards === 0) {
    actions.push(`Assign ${recommendedGuards} guard${recommendedGuards === 1 ? "" : "s"} for the current planning baseline.`);
  } else if (availableGuards < recommendedGuards) {
    const gap = recommendedGuards - availableGuards;
    actions.push(`Add ${gap} available guard${gap === 1 ? "" : "s"} to reach the ${recommendedGuards}-guard planning baseline.`);
  }
  if (forceRatio != null && forceRatio >= 1 && coverageRatio < 1) {
    actions.push("The current raid estimate is matched, but colony-wide guard coverage is still below the planning baseline.");
  } else if (outmatched) {
    actions.push(`${expectedRaiders} estimated raider${expectedRaiders === 1 ? " exceeds" : "s exceed"} the ${availableGuards} available guard${availableGuards === 1 ? "" : "s"}.`);
  }
  if (unavailableGuards > 0) actions.push(`${unavailableGuards} guard${unavailableGuards === 1 ? " is" : "s are"} sick, injured, or unavailable.`);
  if (posts.length > staffedDefensivePosts) {
    const unstaffed = posts.length - staffedDefensivePosts;
    actions.push(`Staff ${unstaffed} completed defensive post${unstaffed === 1 ? "" : "s"}.`);
  }
  if (!hospital) actions.push("A Hospital would improve recovery after combat, but it would not replace missing guards.");
  else if (!hospital.staffed) actions.push("Staff the Hospital for post-raid recovery; it does not add frontline strength.");
  if (actions.length === 0) actions.push("The guard roster meets the planning baseline; equipment and battlefield layout still need an in-game check.");

  return {
    label, tone, score, totalGuards, availableGuards, unavailableGuards, expectedRaiders, forceRatio,
    populationBaseline, recommendedGuards, coverageRatio, defensivePosts: posts.length,
    staffedDefensivePosts, medicalStatus, confidence, confidenceDetail, actions,
  };
}
