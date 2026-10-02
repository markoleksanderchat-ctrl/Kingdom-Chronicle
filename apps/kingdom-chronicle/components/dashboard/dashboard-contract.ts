export const chronicleTabs = [
  { id: "overview", label: "Overview" },
  { id: "projects", label: "Projects" },
  { id: "citizens", label: "Citizens" },
  { id: "buildings", label: "Buildings" },
  { id: "realm", label: "Realm" },
  { id: "records", label: "Records" },
] as const;

export type ChronicleTabId = (typeof chronicleTabs)[number]["id"];

export function nextTabForKey(currentTab: ChronicleTabId, key: string): ChronicleTabId | null {
  const currentIndex = chronicleTabs.findIndex((tab) => tab.id === currentTab);
  if (key === "ArrowRight") return chronicleTabs[(currentIndex + 1) % chronicleTabs.length].id;
  if (key === "ArrowLeft") return chronicleTabs[(currentIndex - 1 + chronicleTabs.length) % chronicleTabs.length].id;
  if (key === "Home") return chronicleTabs[0].id;
  if (key === "End") return chronicleTabs[chronicleTabs.length - 1].id;
  return null;
}
