import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Customer Voice",
  description: "Röster om vårdens digitalisering, kopplade till Inera-produkter i realtid.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
