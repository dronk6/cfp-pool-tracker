import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import NavBar from "./components/NavBar/NavBar";
import SessionNavBar from "./components/NavBar/SessionNavBar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CFP Pool Tracker",
  description: "Track and compare College Football Playoff predictions for the pool.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {/* The session is read per request, so only the nav bar's account
            slot waits for it; the rest of the page stays in the static shell. */}
        <Suspense fallback={<NavBar />}>
          <SessionNavBar />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
