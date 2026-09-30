import { auth } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";
import { Board } from "@/components/board";
import { actorFromSession } from "@/lib/auth";
import { getBoard } from "@/lib/board";
import type { CardDTO, ProjectDTO } from "@/lib/types";

export default async function Home() {
  await auth.protect();
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
