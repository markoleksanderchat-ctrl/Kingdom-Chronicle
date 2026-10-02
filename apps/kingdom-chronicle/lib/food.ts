import type { FoodSupply } from "@/lib/colony-schema";

const statusLabels: Record<string, string> = {
  critical: "Food low",
  incomplete: "Scan incomplete",
  learning: "Waiting",
  low: "Food low",
  menu_empty: "Menu empty",
  no_dining_hall: "No Dining Hall",
  stable: "Well stocked",
  watch: "Food low",
};

export function foodStatusLabel(status: string | null | undefined) {
  return statusLabels[status ?? ""] ?? "Food reserve";
}

export function foodRunwayLabel(food: FoodSupply) {
  if (food.status === "no_dining_hall") return "No Dining Hall";
  if (food.status === "menu_empty") return "Set the menu";
  if (food.truncated) return "Scan incomplete";
  if (food.estimatedDaysRemaining == null) return "Learning";
  if (food.estimatedDaysRemaining < 0.1) return "Under 0.1 day";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(food.estimatedDaysRemaining)} colony days`;
}

export function foodRunoutCopy(food: FoodSupply) {
  if (food.status === "no_dining_hall") {
    return "Build a Dining Hall or Restaurant to track the food reserve.";
  }
  if (food.status === "menu_empty") {
    return "Choose foods on the Restaurant menu.";
  }
  if (food.truncated) {
    return "The food scan was incomplete. The next export will retry it.";
  }
  if (food.estimatedRunoutColonyDay != null) {
    return `May run out near Colony Day ${food.estimatedRunoutColonyDay} if no food is added.`;
  }
  return `Waiting for more meal records. ${food.mealsServedToday ?? 0} served today.`;
}
