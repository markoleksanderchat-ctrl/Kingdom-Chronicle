import type { ReactNode } from "react";
export type ChronicleIcon = "overview" | "projects" | "citizens" | "buildings" | "realm" | "records" | "settings" | "updates" | "about" | "heart";
export function ChronicleGlyph({ icon }: { icon: ChronicleIcon }) {
  const paths: Record<ChronicleIcon, ReactNode> = {
    heart: <path d="M12 20L4 12C-1 5 7 1 12 7c5-6 13-2 8 5z" />,
    overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    projects: <><path d="M4 7.5h6l2 2H20v9H4z" /><path d="M8 4.5h8v5" /></>,
    citizens: <><circle cx="9" cy="8" r="3" /><circle cx="16.5" cy="9" r="2.5" /><path d="M3.5 20c.4-4 2.3-6 5.5-6s5.1 2 5.5 6" /><path d="M14 15c3.4-.6 5.5 1.1 6 4.5" /></>,
    buildings: <><path d="M3.5 20.5h17" /><path d="M5 20V9l7-5 7 5v11" /><path d="M9 20v-6h6v6" /><path d="M8 10h2M14 10h2" /></>,
    realm: <><path d="M12 3.5l7 3v5.5c0 4.4-2.8 7.2-7 8.5-4.2-1.3-7-4.1-7-8.5V6.5z" /><path d="M12 7v9M8.5 11.5h7" /></>,
    records: <><path d="M6 3.5h9l3 3V20.5H6z" /><path d="M15 3.5v4h4" /><path d="M9 11h6M9 14.5h6M9 18h4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 13.5l1.3 1-.9 2.2-1.6-.2-1.3 1.3.2 1.6-2.2.9-1-1.3h-1.9l-1 1.3-2.2-.9.2-1.6-1.3-1.3-1.6.2-.9-2.2 1.3-1v-1.9l-1.3-1 .9-2.2 1.6.2 1.3-1.3-.2-1.6 2.2-.9 1 1.3h1.9l1-1.3 2.2.9-.2 1.6 1.3 1.3 1.6-.2.9 2.2-1.3 1z" /></>,
    updates: <><path d="M19.5 8.5A8 8 0 1 0 20 14" /><path d="M19.5 4.5v4h-4" /><path d="M12 8v7M9 12l3 3 3-3" /></>,
    about: <><circle cx="12" cy="12" r="8.5" /><path d="M12 10.5v6" /><path d="M12 7.5h.01" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[icon]}</svg>;
}
