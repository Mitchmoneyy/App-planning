import type { Metadata, Viewport } from "next";
import { MeProvider } from "@/components/MeProvider";
import { THEME_BOOT_SCRIPT, ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";
import "./shell.css";

export const metadata: Metadata = {
  title: "Global Sanctuary",
  description: "Explore places of worship around the world on a living globe, arrive at any of them, and pray there. Send prayers and blessings to people anywhere.",
  applicationName: "Global Sanctuary",
  appleWebApp: { capable: true, title: "Sanctuary", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05070f" },
    { media: "(prefers-color-scheme: light)", color: "#eef3fb" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme attribute is set before paint by the boot script, so React must not complain about it.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <MeProvider>{children}</MeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
