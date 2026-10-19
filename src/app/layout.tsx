import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Planter CRM",
  description: "Planter-ის გაყიდვები, მარაგი, გაქირავება და მოვლა",
  icons: { icon: "/brand/planter-icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ka">
      <body>{children}</body>
    </html>
  );
}
