import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { Nav, NavFallback } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Fraunces({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "SkinProof — is your skincare actually working?",
  description: "Noise-calibrated skin scans (YouCam AI Skin Analysis), 28-day product trials, ingredient clash checks and an AI coach.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0d0c" },
  ],
};

// Runs before first paint so the saved theme never flashes (see ThemeToggle in components/nav.tsx).
const THEME_SCRIPT = `try{var t=localStorage.getItem("skinproof:theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth" className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Suspense fallback={<NavFallback />}>
          <Nav />
        </Suspense>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-6 pt-6">{children}</main>
        <footer className="mx-auto mt-8 flex w-full max-w-6xl flex-wrap gap-x-4 gap-y-1 border-t border-line/70 px-4 pb-28 pt-5 text-xs text-muted lg:pb-8 print:hidden">
          <span>Not medical advice · measurements by YouCam AI Skin Analysis</span>
          <span className="hidden sm:inline">· Press ⌘K to jump anywhere</span>
          <Link href="/evidence" className="hover:text-ink">
            Method &amp; evidence
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy &amp; safety
          </Link>
          <Link href="/report" className="hover:text-ink">
            Dermatologist report
          </Link>
        </footer>
      </body>
    </html>
  );
}
