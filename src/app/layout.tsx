import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const notoSansJp = Noto_Sans_JP({
	variable: "--font-noto-sans-jp",
	display: "swap",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "ReSlot — 日程変更を、確実に。",
	description: "日程変更の申請から通知・監査までを一つにまとめたデモアプリです。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="ja">
			<body className={notoSansJp.variable}>{children}</body>
		</html>
	);
}
