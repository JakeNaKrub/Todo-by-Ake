import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { appConfig } from "@/lib/app-config";
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
  title: appConfig.name,
  description: appConfig.description,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon-192.jpg",
    apple: "/apple-touch-icon.jpg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
