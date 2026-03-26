import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Source_Sans_3 } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Dream12 — Fantasy Cricket League",
  description: "Mobile-first fantasy cricket with live leaderboards",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Dream12",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/brand-logo.png", type: "image/png" }],
    apple: [{ url: "/brand-logo.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-dvh flex flex-col font-sans">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
