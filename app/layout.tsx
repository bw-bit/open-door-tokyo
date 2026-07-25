import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OPEN DOOR TOKYO",
  description:
    "店舗動画から、電話せず来店判断できる具体的な事実と幅付き参考推定を示すAIエージェント"
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
