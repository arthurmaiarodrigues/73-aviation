import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "73 Aviation",
    template: "%s · 73 Aviation",
  },
  description: "Diário de bordo, despesas e agenda do RV-10 PP-ZNM",
  manifest: "/manifest.json",
  applicationName: "73 Aviation",
  appleWebApp: { capable: true, title: "73 Aviation", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icones/favicon.ico" },
      { url: "/icones/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icones/icon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/icones/icon-180.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0E2846",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
