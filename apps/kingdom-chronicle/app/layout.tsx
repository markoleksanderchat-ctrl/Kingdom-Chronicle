import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://kingdom-chronicle-prototype.markoleksanderchat.chatgpt.site"),
  title: "Kingdom Chronicle",
  description: "A private MineColonies desktop companion.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Kingdom Chronicle",
    description: "A private MineColonies desktop companion.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Kingdom Chronicle",
    description: "A private MineColonies desktop companion.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#eee9df",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
