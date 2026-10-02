import { citizenStatus, formatNumber, identifierName } from "../colony";
import type { Citizen, ColonySnapshot, Construction } from "../colony-schema";

export function snapshotIdentity(snapshot: ColonySnapshot) {
  return [snapshot.generatedAt, snapshot.fingerprint ?? "", snapshot.world.dimension ?? "",
    snapshot.colony.id ?? "", snapshot.colony.name ?? ""].join("|");
}

export function constructionPhaseIndex(project: Construction) {
  const phase = project.projectState?.toUpperCase() ?? "";
  if (/COMPLETE|FINISH|DECORAT/.test(phase)) return 3;
  if (/SOLID|BUILD/.test(phase)) return 2;
  if (/CLEAR|FOUNDATION/.test(phase)) return 1;
  return 0;
}

export function constructionCompletionPercent(project: Construction) {
  if (project.progress == null || !Number.isFinite(project.progress)) return null;
  return Math.round(Math.max(0, Math.min(1, project.progress)) * 100);
}

export function constructionName(project: Construction) {
  const displayName = project.details.displayName;
  return typeof displayName === "string" && displayName
    ? displayName : identifierName(String(project.details.translationKey ?? project.projectType));
}

export function citizenAttentionReason(citizen: Citizen) {
  if (citizen.sick) return "Sick";
  if (citizen.injured) return "Injured";
  if (citizen.happiness != null && citizen.happiness < 6) return `Happiness ${formatNumber(citizen.happiness, 1)} / 10`;
  if (citizen.requestingItem) return "Waiting for an item";
  if (citizen.idle) return "Idle at work";
  if (citizen.saturation != null && citizen.saturation < 5) return `Low saturation: ${formatNumber(citizen.saturation, 1)}`;
  return citizenStatus(citizen);
}

export function citizenTreatmentCondition(citizen: Citizen) {
  if (citizen.sick && citizen.injured) return "Sick and Injured";
  if (citizen.sick) return "Sick";
  if (citizen.injured) return "Injured";
  return "Needs care";
}

export function requestStateLabel(state: string | null, remaining: number | null) {
  if (remaining != null && remaining <= 0) return "Delivery pending";
  return state ? identifierName(state.toLowerCase()) : "Unavailable";
}
