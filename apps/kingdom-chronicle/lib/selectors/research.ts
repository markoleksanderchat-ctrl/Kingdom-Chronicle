import { researchName } from "../colony";
import { explainResearchEffect } from "../research-effects";
import type { ColonySnapshot } from "../colony-schema";

export function selectResearch(research: ColonySnapshot["research"]) {
  const effects = research.effects ?? [];
  return {
    completed: research.completed.map(researchName),
    effects,
    benefits: effects.map((effect) => ({ id: effect.id, summary: explainResearchEffect(effect.id, effect.strength) })),
  };
}
