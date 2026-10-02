import type { FoodSupply } from "../colony-schema";

export function selectFood(foodSupply: FoodSupply | undefined) {
  const topFoods = Object.entries(foodSupply?.servingsByItem ?? {})
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const menuFoods = foodSupply?.approvedMenuItems ?? [];
  const missingMenuFoods = menuFoods.filter((item) => foodSupply?.servingsByItem[item] === 0
    || (!(item in (foodSupply?.servingsByItem ?? {})) && !foodSupply?.truncated));
  return { topFoods, menuFoods, missingMenuFoods };
}
