import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OPEN DOOR TOKYO",
  description:
    "店舗動画を、証拠付きの来店前アクセシビリティ情報へ変換するAIエージェント"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

