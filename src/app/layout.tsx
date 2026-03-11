import type { Metadata } from "next";
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
        <div aria-hidden="true" className="app-background">
          <div className="app-background-gradient" />
          <div className="app-moving-blobs">
            <span className="app-blob app-blob--1" />
            <span className="app-blob app-blob--2" />
            <span className="app-blob app-blob--3" />
            <span className="app-blob app-blob--4" />
          </div>
          <div className="app-background-image" />
        </div>
        <div className="app-content">{children}</div>
      </body>
    </html>
  );
}
