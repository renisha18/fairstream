import type { Metadata } from "next";
import { Instrument_Serif, Inter, Sancreek } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "./session";

// Inter for everything people read and tap: navigation, buttons, prices, labels, body copy.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Instrument Serif only for the FairStream wordmark and large titles. It comes in one weight.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

// Sancreek, a condensed 19th-century wood-type face, only for the FairStream wordmark.
const sancreek = Sancreek({
  variable: "--font-sancreek",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FairStream",
  description: "Pay only for the seconds you watch.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable} ${sancreek.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
