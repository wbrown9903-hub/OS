import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ShellProvider } from "../lib/client/shell-store.js";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus OS",
  description:
    "A customisable command centre for your Mac — launcher, AI workspace, knowledge base and store dashboards in one editable surface.",
};

export const viewport: Viewport = {
  themeColor: "#07090F",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Keyboard users land here first; the shell's main region is the target. */}
        <a className="nx-skip-link" href="#nx-main">
          Skip to dashboard
        </a>
        <ShellProvider>{children}</ShellProvider>
      </body>
    </html>
  );
}
