import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";
import { Board } from "@/components/board";
import { Landing } from "@/components/landing";
import { actorFromSession } from "@/lib/auth";
import { getBoard } from "@/lib/board";
import { preferredLang } from "@/lib/lang";
import type { CardDTO, ProjectDTO } from "@/lib/types";

const DESCRIPTION = {
  en: "An infinite canvas for what you park for later, with a CLI so your coding agents park things for you.",
  es: "Un lienzo infinito para lo que queda para después, con un CLI para que tus agentes parqueen por ti.",
};

export async function generateMetadata(): Promise<Metadata> {
  const description = DESCRIPTION[await preferredLang()];
  return {
    description,
    // The landing is public; the board behind sign-in is not.
    robots: { index: true, follow: true },
    openGraph: { title: "Parkboard", description, images: ["/screenshot.png"] },
  };
}

export default async function Home() {
  const { isAuthenticated } = await auth();
  // Visitors see what Parkboard is instead of landing on the sign-in screen.
  if (!isAuthenticated) return <Landing lang={await preferredLang()} />;
  const owner = await actorFromSession();
  if (!owner) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <p className="text-muted">Esta cuenta no tiene acceso a este tablero.</p>
        <SignOutButton>
          <button className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-raised">Cerrar sesión</button>
        </SignOutButton>
      </main>
    );
  }
  const board = await getBoard(owner.userId);
  return <Board initial={JSON.parse(JSON.stringify(board)) as { projects: ProjectDTO[]; cards: CardDTO[] }} />;
}
