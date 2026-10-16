import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Futures Dashboard",
  description: "Real-time futures market regime and positioning dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
