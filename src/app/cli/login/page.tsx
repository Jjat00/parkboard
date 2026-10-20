import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { actorFromSession } from "@/lib/auth";
import { preferredLang } from "@/lib/lang";
import { authorizeCli } from "./actions";
import { parseLoginRequest } from "./request";

export const metadata: Metadata = { title: "Conectar el CLI · Parkboard", robots: { index: false } };

const COPY = {
  en: {
    title: "Connect your terminal",
    body: (name: string) => `park login on “${name}” wants access to your board. It gets its own key, which you can revoke from the CLI button on the board.`,
    authorize: "Authorize",
    cancel: "Cancel",
    bad: "This link is incomplete. Run park login again in your terminal.",
    denied: "This account has no access to this board.",
  },
  es: {
    title: "Conecta tu terminal",
    body: (name: string) => `park login en «${name}» quiere acceso a tu tablero. Recibe su propia clave, que puedes revocar desde el botón CLI del tablero.`,
    authorize: "Autorizar",
    cancel: "Cancelar",
    bad: "Este enlace está incompleto. Vuelve a correr park login en tu terminal.",
    denied: "Esta cuenta no tiene acceso a este tablero.",
  },
};

export default async function CliLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { isAuthenticated, redirectToSignIn } = await auth();
  // Sign-in brings the person back here with the same port and state.
  if (!isAuthenticated) return redirectToSignIn();
  const c = COPY[await preferredLang()];
  const req = parseLoginRequest(await searchParams);
  const owner = await actorFromSession();

  return (
    <main className="flex h-full items-center justify-center bg-ink px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="text-gradient">Parkboard</span>
        </h1>
        {!owner ? (
          <p className="mt-4 text-sm text-muted">{c.denied}</p>
        ) : !req ? (
          <p className="mt-4 text-sm text-muted">{c.bad}</p>
        ) : (
          <form action={authorizeCli} className="mt-4">
            <h2 className="font-semibold tracking-tight">{c.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{c.body(req.name)}</p>
            <input type="hidden" name="port" value={req.port} />
            <input type="hidden" name="state" value={req.state} />
            <input type="hidden" name="name" value={req.name} />
            <div className="mt-6 flex gap-2">
              <button className="flex-1 rounded-lg bg-fg px-4 py-2.5 text-sm font-medium text-ink hover:opacity-90">
                {c.authorize}
              </button>
              <Link href="/" className="rounded-lg border border-line px-4 py-2.5 text-sm text-muted hover:bg-raised hover:text-fg">
                {c.cancel}
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
