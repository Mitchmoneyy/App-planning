import type { Metadata, Viewport } from "next";
import { MeProvider } from "@/components/MeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Global Sanctuary",
  description: "Explore places of worship of every faith on an interactive globe, and pray at any of them from wherever you are.",
  applicationName: "Global Sanctuary",
  appleWebApp: { capable: true, title: "Sanctuary", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // use the full screen on notched phones
  themeColor: "#0b1020",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <MeProvider>{children}</MeProvider>
      </body>
    </html>
  );
}
