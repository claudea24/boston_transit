import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import ClientProviders from "@/components/ClientProviders";
import Navbar from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Live Transit + Weather Dashboard",
  description: "Weather-aware trip planning with live transit, route ranking, and realtime updates.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen text-white">
          <ClientProviders>
            <Navbar />
            <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-16">
              {children}
            </div>
          </ClientProviders>
        </body>
      </html>
    </ClerkProvider>
  );
}
