import type { ColonySnapshot } from "../colony-schema";

export const statisticOrder = [
  "blocks_placed", "items_delivered", "items_crafted", "food_served", "land_tilled",
  "crops_harvested", "trees_cut", "build_built", "build_upgraded", "citizens_healed",
  "num_diseases_treated", "visitors_recruited", "visitors_absconded", "death", "blocks_mined",
] as const;

export const statisticLabels: Record<string, string> = {
  blocks_placed: "Blocks placed", build_built: "Buildings completed", build_upgraded: "Buildings upgraded",
  citizens_healed: "Citizens healed", crops_harvested: "Crops harvested", death: "Citizen deaths",
  food_served: "Meals served", items_crafted: "Items crafted", items_delivered: "Items delivered",
  land_tilled: "Land tilled", num_diseases_treated: "Diseases treated", trees_cut: "Trees cut",
  visitors_absconded: "Visitors departed", visitors_recruited: "Visitors recruited", blocks_mined: "Blocks mined",
  build_removed: "Buildings removed", graves_dug: "Graves dug", mobs_killed: "Mobs killed",
};

export function selectStatistics(snapshot: ColonySnapshot) {
  const recent = snapshot.recentStatistics;
  const recentKeys = [
    ...statisticOrder.filter((key) => key in (recent?.recentWindow ?? {}) || key in (recent?.today ?? {})),
    ...[...new Set([...Object.keys(recent?.today ?? {}), ...Object.keys(recent?.recentWindow ?? {})])]
      .filter((key) => !statisticOrder.includes(key as typeof statisticOrder[number])).sort(),
  ];
  const simpleRecentKeys = recentKeys.filter((key) => (recent?.today[key] ?? 0) > 0 || (recent?.recentWindow[key] ?? 0) > 0).slice(0, 6);
  const visibleStats = [
    ...statisticOrder.filter((key) => key in snapshot.statistics),
    ...Object.keys(snapshot.statistics).filter((key) => !statisticOrder.includes(key as typeof statisticOrder[number])).sort(),
  ];
  const defense = snapshot.defenseStatistics;
  const lifetimeDefenseDetail = defense?.lifetime.detailedTotal
    ?? Object.values(defense?.lifetime.byEntity ?? {}).reduce((total, count) => total + count, 0);
  const defenseCoverage = defense && defense.lifetime.total > 0
    ? Math.min(100, lifetimeDefenseDetail / defense.lifetime.total * 100) : 100;
  const defensiveKillsByEntity = Object.entries(defense?.lifetime.byEntity ?? {})
    .filter(([, count]) => count > 0).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return { recent, recentKeys, simpleRecentKeys, visibleStats, defense, lifetimeDefenseDetail, defenseCoverage, defensiveKillsByEntity };
}
