import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import { GoogleAnalytics } from "@/components/google-analytics";
import { Providers } from "@/components/providers";
import "@fontsource-variable/montserrat/wght.css";
import "@fontsource-variable/noto-sans-sc/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Closr — B2B Sales Judgment",
  description:
    "Understand customer signals, review the evidence, and plan the next sales move.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full bg-background text-foreground">
        <GoogleAnalytics />
        <Providers>
          <AuthProvider>
            {children}
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
