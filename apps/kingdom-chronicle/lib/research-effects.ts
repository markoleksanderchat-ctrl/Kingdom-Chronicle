export interface ResearchEffectSummary {
  title: string;
  description: string;
  value: string;
}

type EffectCopy = Omit<ResearchEffectSummary, "value"> & { value?: string };

const effectCopy: Record<string, EffectCopy> = {
  assistanthammerunlock: {
    title: "Builder's Assistant Hammers",
    description: "Lets you place materials for an active Builder project with an Assistant Hammer.",
    value: "Recipes unlocked",
  },
  blockbreakspeedmultiplier: {
    title: "Faster block breaking",
    description: "Workers break blocks faster.",
  },
  blockplacespeedmultiplier: {
    title: "Faster building",
    description: "Workers place blocks faster.",
  },
  citizencapaddition: {
    title: "Citizen capacity",
    description: "Raises the colony's citizen limit.",
  },
  farmingmultiplier: {
    title: "Crop harvest",
    description: "Farmers harvest more crops.",
  },
  happinessmultiplier: {
    title: "Happiness",
    description: "Raises citizen happiness.",
  },
  healingsaturationlimitaddition: {
    title: "Earlier healing",
    description: "Citizens can begin healing at a lower food level.",
    value: "−1 food point",
  },
  healthaddition: {
    title: "Citizen health",
    description: "Citizens gain more health.",
  },
  meleearmormultiplier: {
    title: "Melee armor",
    description: "Melee guards gain more armor protection.",
  },
  min_order: {
    title: "Fewer early requests",
    description: "Buildings wait longer before placing supply requests.",
    value: "Active",
  },
  recipesmultiplier: {
    title: "Recipe capacity",
    description: "Workers can learn more recipes.",
  },
  saturationmultiplier: {
    title: "Meal fullness",
    description: "Meals keep citizens full for longer.",
  },
  sleeplessmultiplier: {
    title: "Guard rest",
    description: "Guards need less sleep.",
  },
  tooldurabilitymultiplier: {
    title: "Tool durability",
    description: "Workers' tools last longer.",
  },
  blockhutblacksmith: {
    title: "Blacksmith's Hut",
    description: "Unlocks the Blacksmith's Hut for the colony.",
    value: "Unlocked",
  },
  blockhuthospital: {
    title: "Hospital",
    description: "Unlocks the Hospital so sick and injured citizens can receive treatment.",
    value: "Unlocked",
  },
  blockhutsawmill: {
    title: "Sawmill",
    description: "Unlocks the Sawmill for crafting wood-based building materials.",
    value: "Unlocked",
  },
  blockhutstonemason: {
    title: "Stonemason's Hut",
    description: "Unlocks the Stonemason's Hut for crafting stone building materials.",
    value: "Unlocked",
  },
  softshoesunlock: {
    title: "Crop-safe farming",
    description: "Farmers no longer trample crops while working in the fields.",
  },
  workinginrainunlock: {
    title: "Rain-ready workers",
    description: "Citizens can keep working when it rains.",
  },
  vinesunlock: {
    title: "Vine climbing",
    description: "Citizens can climb vines to move around the colony.",
  },
  railsunlock: {
    title: "Rail travel",
    description: "Citizens can use rails for transportation.",
  },
  minerfireresunlock: {
    title: "Fire-safe miners",
    description: "Miners become immune to fire and lava hazards.",
  },
  retreatunlock: {
    title: "Guard retreat",
    description: "Guards retreat when their health drops below 20 percent.",
  },
  shieldusageunlock: {
    title: "Knight shields",
    description: "Knights can use shields in combat.",
  },
  piercingarrowsunlock: {
    title: "Piercing arrows",
    description: "Archers gain the Piercing II arrow effect.",
  },
  knighttauntmobsunlock: {
    title: "Knight taunt",
    description: "Knights can force hostile creatures to target them instead of other citizens.",
  },
  guardcrit: {
    title: "Critical strikes",
    description: "Guards gain a chance to deal critical-hit damage.",
  },
  masks: {
    title: "Disease masks",
    description: "Reduces the chance that diseases spread between citizens.",
  },
  vaccines: {
    title: "Longer immunity",
    description: "Citizens remain immune to a treated disease for longer.",
  },
  air: {
    title: "Underwater endurance",
    description: "Citizens can remain underwater for longer.",
  },
  fishingtreasure: {
    title: "Treasure fishing",
    description: "Fishers can find treasure outside ocean biomes.",
  },
  greenrevolution: {
    title: "Spreading crops",
    description: "Crops can grow outward into nearby spaces.",
  },
};

const buildingNames: Record<string, string> = {
  alchemist: "Alchemist's Hut",
  archery: "Archery",
  barracks: "Barracks",
  combatacademy: "Combat Academy",
  composter: "Composter's Hut",
  concretemixer: "Concrete Mixer's Hut",
  crusher: "Crusher's Hut",
  dyer: "Dyer's Hut",
  fletcher: "Fletcher's Hut",
  florist: "Flower Shop",
  glassblower: "Glassblower's Hut",
  graveyard: "Graveyard",
  library: "Library",
  mechanic: "Mechanic's Hut",
  mysticalsite: "Mystical Site",
  netherworker: "Nether Mine",
  plantation: "Plantation",
  school: "School",
  sifter: "Sifter's Hut",
  smeltery: "Smeltery",
  stonesmeltery: "Brick Yard",
};

const phraseParts: Array<[string, string]> = [
  ["citizen", "citizen "],
  ["guard", "guard "],
  ["archer", "archer "],
  ["knight", "knight "],
  ["worker", "worker "],
  ["tool", "tool "],
  ["armor", "armor "],
  ["damage", "damage "],
  ["durability", "durability "],
  ["health", "health "],
  ["happiness", "happiness "],
  ["saturation", "meal fullness "],
  ["walking", "walking "],
  ["speed", "speed "],
  ["growth", "growth "],
  ["recipes", "recipe capacity "],
  ["farming", "crop harvest "],
  ["leveling", "experience gain "],
  ["teaching", "study experience "],
  ["regeneration", "health regeneration "],
];

function effectKey(id: string) {
  return id.split(/[/:]/).at(-1)?.toLowerCase() ?? id.toLowerCase();
}

function sentenceCase(value: string) {
  const clean = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "Research benefit";
}

function readableSubject(key: string) {
  let remaining = key
    .replace(/multiplier$/, "")
    .replace(/addition$/, "")
    .replace(/unlock$/, "");
  let result = "";
  for (const [token, words] of phraseParts) {
    if (remaining.includes(token)) {
      result += words;
      remaining = remaining.replace(token, "");
    }
  }
  if (remaining) result += remaining.replace(/([a-z])([0-9])/g, "$1 $2");
  return sentenceCase(result);
}

function formatEffectValue(key: string, strength: number | null) {
  if (strength == null || !Number.isFinite(strength)) return "Active";
  if (key.endsWith("multiplier")) {
    const percent = Math.abs(strength) <= 5 ? strength * 100 : strength;
    return `${percent >= 0 ? "+" : ""}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(percent)}%`;
  }
  if (key.endsWith("addition")) {
    return `${strength >= 0 ? "+" : ""}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(strength)}`;
  }
  return "Active";
}

export function explainResearchEffect(id: string, strength: number | null): ResearchEffectSummary {
  const key = effectKey(id);
  const known = effectCopy[key];
  if (known) return { ...known, value: known.value ?? formatEffectValue(key, strength) };

  if (key.startsWith("blockhut")) {
    const buildingKey = key.slice("blockhut".length);
    const building = buildingNames[buildingKey] ?? sentenceCase(buildingKey);
    return {
      title: building,
      description: `Unlocks the ${building} for the colony.`,
      value: "Unlocked",
    };
  }

  const subject = readableSubject(key);
  if (key.endsWith("unlock")) {
    return {
      title: subject,
      description: `Unlocks ${subject.toLowerCase()} for the colony.`,
      value: "Unlocked",
    };
  }
  if (key.endsWith("multiplier") || key.endsWith("addition")) {
    return {
      title: subject,
      description: `Improves ${subject.toLowerCase()} across the colony.`,
      value: formatEffectValue(key, strength),
    };
  }
  return {
    title: subject,
    description: `Activates the ${subject.toLowerCase()} research benefit.`,
    value: formatEffectValue(key, strength),
  };
}
