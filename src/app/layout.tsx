import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "HPLUS Analytics", template: "%s | HPLUS Analytics" },
  description: "店舗・キャスト・媒体データを統合する業務分析システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
