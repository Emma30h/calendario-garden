import type { Metadata } from "next";
import { AppBackground } from "@/components/AppBackground";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calendario Garden",
  description: "Proyecto base en Next.js",
  icons: {
    icon: "/icon_dmca.png",
    shortcut: "/icon_dmca.png",
    apple: "/icon_dmca.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="app-shell antialiased">
        <AppBackground />
        <div className="app-content">{children}</div>
      </body>
    </html>
  );
}
