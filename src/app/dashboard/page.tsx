import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { actorFromSession } from "@/lib/auth";
import { getBoard } from "@/lib/board";
import type { CardDTO, ProjectDTO } from "@/lib/types";

export const metadata: Metadata = { title: "Actividad · Parkboard" };

export default async function DashboardPage() {
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn();
  const owner = await actorFromSession();
  // Same rule as the board: a session outside the allowlist sees the notice on "/".
  if (!owner) redirect("/");
  const board = await getBoard(owner.userId);
  return <Dashboard {...(JSON.parse(JSON.stringify(board)) as { projects: ProjectDTO[]; cards: CardDTO[] })} />;
}
