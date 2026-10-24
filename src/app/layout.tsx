import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import { GoogleAnalytics } from "@/components/google-analytics";
import { Providers } from "@/components/providers";
import "@fontsource-variable/montserrat/wght.css";
import "@fontsource-variable/noto-sans-sc/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Closr — 解读客户，赢得订单",
  description:
    "AI 驱动的销售情报工具，解读每一封客户邮件背后的真实意图。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
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
