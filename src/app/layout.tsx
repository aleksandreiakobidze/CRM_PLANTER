import type { Metadata } from "next";
import { PwaRegister } from "@/components/pwa-register";
import { ThemeProvider } from "@/context/theme-context";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "https://crm.planter.ge"),
  title: "Planter CRM",
  description: "Planter-ის გაყიდვები, მარაგი, გაქირავება და მოვლა",
  icons: { icon: "/brand/planter-icon.png" },
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
};

const themeBoot = `try{if(localStorage.getItem("planter-theme")==="dark"){document.documentElement.classList.add("dark");document.documentElement.setAttribute("data-color-scheme","dark")}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ka" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        <ThemeProvider>
          <PwaRegister />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
