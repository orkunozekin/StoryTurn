import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Atkinson_Hyperlegible, JetBrains_Mono, Young_Serif } from "next/font/google";
import { ToastProvider } from "@/components/toast-provider";
import { hydrateDemoSessionFromCookie } from "@/lib/demo-session";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import "./globals.css";

const display = Young_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const sans = Atkinson_Hyperlegible({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["500"],
});

export const metadata: Metadata = {
  title: "StoryTurn",
  description:
    "Know whose night it is, keep your family library, and never lose the bedtime reading rotation.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await hydrateDemoSessionFromCookie();
  // No saved choice leaves data-theme off, and the CSS follows the OS setting.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      data-theme={theme ?? undefined}
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
