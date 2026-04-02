import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Bebas_Neue, Source_Sans_3 } from "next/font/google";
import { NavigationProgress } from "@/components/navigation-progress";
import { SerwistProvider } from "@/components/serwist-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const display = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
});

/** Approximates `--background` oklch(0.19 0.045 265) for browser chrome & PWA. */
const THEME_COLOR = "#161c2e";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: THEME_COLOR,
};

const APP_NAME = "Dream12";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: "Dream12 — Fantasy Cricket League",
  description: "Mobile-first fantasy cricket with live leaderboards",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      {
        url: "/icons/icon-192.png",
        type: "image/png",
        sizes: "192x192",
      },
      {
        url: "/icons/icon-512.png",
        type: "image/png",
        sizes: "512x512",
      },
    ],
    apple: [
      { url: "/icons/icon-192.png", sizes: "192x192" },
      { url: "/icons/icon-512.png", sizes: "512x512" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Extensions (e.g. Chrome __gchrome_remoteframetoken) may alter <html> before hydrate.
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh flex flex-col font-sans">
        <SerwistProvider>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          {children}
          <Toaster richColors position="top-center" />
        </SerwistProvider>
      </body>
    </html>
  );
}
