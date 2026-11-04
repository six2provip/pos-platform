import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "POS.com — Cloud Control Plane Console",
  description:
    "Clean Enterprise Cloud Control Plane for Multi-Tenant SaaS & Private Server Deployments, Ed25519 Licensing & Fleet Heartbeats",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-white text-neutral-900 antialiased selection:bg-neutral-900 selection:text-white">
        {children}
      </body>
    </html>
  );
}
