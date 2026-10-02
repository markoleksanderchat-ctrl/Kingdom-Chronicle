import type { Citizen } from "../colony-schema";

export function citizenNeedsAttention(citizen: Citizen) {
  return citizen.happiness != null && citizen.happiness < 6 || citizen.sick || citizen.injured
    || citizen.requestingItem || citizen.idle || citizen.saturation != null && citizen.saturation < 5;
}

export function selectCitizens(citizens: readonly Citizen[]) {
  const byId = new Map(citizens.flatMap((citizen) => citizen.id == null ? [] : [[citizen.id, citizen] as const]));
  const lowMorale = citizens.filter((citizen) => citizen.happiness != null && citizen.happiness < 6);
  const unhealthy = citizens.filter((citizen) => citizen.sick || citizen.injured || citizen.alive === false);
  const needsTreatment = citizens.filter((citizen) => citizen.sick || citizen.injured);
  const hospitalized = needsTreatment.filter((citizen) => citizen.details.hospitalized === true);
  const attention = citizens.filter(citizenNeedsAttention).sort((left, right) =>
    (left.happiness ?? 10) - (right.happiness ?? 10) || (left.saturation ?? 20) - (right.saturation ?? 20));
  const allByAttention = [...citizens].sort((left, right) =>
    (left.happiness ?? 10) - (right.happiness ?? 10) || (left.name ?? "").localeCompare(right.name ?? ""));
  return { byId, lowMorale, unhealthy, needsTreatment, hospitalized, attention, allByAttention };
}
