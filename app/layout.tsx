import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeWeave — Different tastes. One unforgettable plan.",
  description: "A culturally intelligent group-planning agent powered by Qloo taste signals."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
