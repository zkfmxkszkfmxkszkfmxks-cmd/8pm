import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "마감한끼",
  description: "서울 골목의 오늘 메뉴를 둘러보고 맞춤 한끼를 추천받으세요.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
