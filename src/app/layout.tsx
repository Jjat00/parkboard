import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { enUS, esES } from "@clerk/localizations";
import { dark } from "@clerk/themes";
import { LangProvider } from "@/components/lang";
import { preferredLang } from "@/lib/lang";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

const DESCRIPTION = {
  es: "Un lienzo para lo que queda para después.",
  en: "A canvas for what you leave for later.",
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL("https://parkboard.jato.run"),
    title: "Parkboard",
    description: DESCRIPTION[await preferredLang()],
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await preferredLang();
  return (
    <html lang={lang} className={`${inter.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="h-full font-sans">
        <ClerkProvider
          localization={lang === "es" ? esES : enUS}
          appearance={{ theme: dark, variables: { colorPrimary: "#68ddfd", colorBackground: "#111110" } }}
        >
          <LangProvider lang={lang}>{children}</LangProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
