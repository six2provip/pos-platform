import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "POS.com — Organization Admin & Web POS",
  description:
    "Clean Enterprise Multi-Tenant POS Platform — Store Operations, Inventory & Offline-First Web POS",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={inter.variable}>
      <body
        className={`${inter.className} min-h-screen bg-white text-neutral-900 antialiased selection:bg-neutral-900 selection:text-white`}
      >
        {children}
      </body>
    </html>
  );
}
