"use client";

export {
  ChronicleDashboard,
  chronicleTabs,
  type ChronicleDashboardProps,
  type ChronicleTabId,
  type ChronicleViewMode,
} from "@/components/dashboard/chronicle-dashboard";

export default function Home() {
  return (
    <main className="shelved-site">
      <div className="shelved-mark" aria-hidden="true">KC</div>
      <p className="kicker">MineColonies companion</p>
      <h1>Kingdom Chronicle is now on desktop.</h1>
      <p>Open the desktop app to view your colony privately on this computer.</p>
      <div className="shelved-status"><span aria-hidden="true" /><div><strong>Desktop updates available</strong><small>Verified releases only</small></div></div>
    </main>
  );
}
