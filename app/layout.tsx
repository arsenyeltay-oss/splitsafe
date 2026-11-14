import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const description =
  "See all your Buy Now, Pay Later plans against your paycheck. Find your danger days before autopay does.";

export const metadata: Metadata = {
  metadataBase: new URL("https://splitsafe-phi.vercel.app"),
  title: "SplitSafe — Know before you Pay in 4",
  description,
  openGraph: {
    title: "SplitSafe — Know before you Pay in 4",
    description,
    url: "/",
    siteName: "SplitSafe",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "SplitSafe: Know before you Pay in 4" }],
  },
  twitter: { card: "summary_large_image", title: "SplitSafe — Know before you Pay in 4", description, images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
