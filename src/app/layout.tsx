import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { preferredLang } from "@/lib/lang";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://parkboard.jaimeaza.tech"),
  title: "Parkboard",
  description: "Un lienzo para lo que queda para después.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={await preferredLang()} className={`${inter.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="h-full font-sans">
        <ClerkProvider appearance={{ theme: dark, variables: { colorPrimary: "#68ddfd", colorBackground: "#111110" } }}>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
