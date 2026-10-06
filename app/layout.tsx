import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import Header from "@/app/components/Header";

export const metadata: Metadata = {
  title: "Captioned NYC",
  description:
    "AI captions for your New York moments — post, vote, and climb the daily board. COMS 6998 Design for Generative AI, week 4.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">
        <Header />
        {children}
      </body>
    </html>
  );
}
