import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, FolderKanban, KeyRound, Layers, Lock, Terminal } from "lucide-react";
import type { Lang } from "@/lib/lang";

const REPO = "https://github.com/Jjat00/parkboard";

const COPY = {
  en: {
    signIn: "Sign in",
    badge: "Private beta · public sign-up coming soon",
    title1: "Park it",
    title2: "for later.",
    lead: "An infinite canvas for the side tasks, ideas and bugs that come up while you work with an AI agent. Your agent parks each one with enough context to pick it up cold, and a link back to the session where it was born.",
    github: "View on GitHub",
    selfHost: "Host your own",
    shotAlt: "Parkboard: the Tasks view with cards grouped by project",
    whyTitle: "Why",
    why: "One task keeps spawning others: a bug you spot while fixing something else, an idea for later, a check to run before shipping. You stay on the main task, and by the end of the session those side tasks are lost in the conversation. Parkboard keeps them in one place.",
    howTitle: "How it works",
    steps: [
      { t: "You say “let’s leave that for later”", d: "Mid-session, to Claude Code, Codex or any agent with a shell." },
      { t: "The agent runs park add", d: "Title, project, kind, priority, notes to resume it cold, and the session id." },
      { t: "It lands on your canvas", d: "Grouped by project, one card away from the session it came from." },
    ],
    featTitle: "What you get",
    feats: [
      { icon: Layers, t: "Infinite canvas", d: "Projects are groups that fit their cards; drag a card to move it between projects." },
      { icon: FolderKanban, t: "Tasks, Ideas and Notes", d: "One view at a time, so ideas and notes do not crowd the work. Personal and work areas." },
      { icon: Bot, t: "Born in a session", d: "Every card remembers the agent, session and folder, so you can resume the conversation." },
      { icon: Terminal, t: "CLI for agents", d: "park has no dependencies: JSON when piped, --dry-run on writes, park schema for agents." },
      { icon: KeyRound, t: "API keys", d: "Bearer keys for the CLI, stored as SHA-256 hashes, created from the web." },
      { icon: Lock, t: "Private by default", d: "One board per user, plus an optional email allowlist." },
    ],
    cliTitle: "From the terminal",
    cliOut: "parked #13 Check the coupon with free shipping (shop)",
    soonTitle: "Sign-up is not open yet",
    soon: "This instance is private while Google sign-in moves to production. The code is public: run your own board in a few minutes.",
    stack: "Next.js 16 · React 19 · React Flow · Prisma 7 on Postgres · Clerk",
    by: "Built by",
  },
  es: {
    signIn: "Iniciar sesión",
    badge: "Beta privada · el registro abre pronto",
    title1: "Parquéalo",
    title2: "para después.",
    lead: "Un lienzo infinito para las tareas, ideas y bugs que salen mientras trabajas con un agente de IA. El agente parquea cada uno con el contexto justo para retomarlo en frío y un enlace a la sesión donde nació.",
    github: "Ver en GitHub",
    selfHost: "Instálalo tú",
    shotAlt: "Parkboard: la vista Tareas con tarjetas agrupadas por proyecto",
    whyTitle: "Por qué",
    why: "Una tarea siempre trae otras: un bug que ves mientras arreglas algo más, una idea para luego, una revisión antes de publicar. Sigues con la tarea principal y, al final de la sesión, esas tareas laterales se pierden en la conversación. Parkboard las junta en un solo lugar.",
    howTitle: "Cómo funciona",
    steps: [
      { t: "Dices «dejémoslo para después»", d: "En plena sesión, a Claude Code, Codex o cualquier agente con terminal." },
      { t: "El agente corre park add", d: "Título, proyecto, tipo, prioridad, notas para retomarlo en frío y el id de la sesión." },
      { t: "Aparece en tu lienzo", d: "Agrupada por proyecto, a una tarjeta de la sesión de donde salió." },
    ],
    featTitle: "Qué trae",
    feats: [
      { icon: Layers, t: "Lienzo infinito", d: "Los proyectos son grupos que se ajustan a sus tarjetas; arrastra una tarjeta para cambiarla de proyecto." },
      { icon: FolderKanban, t: "Tareas, Ideas y Notas", d: "Una vista a la vez, para que ideas y notas no ensucien el trabajo. Áreas personal y trabajo." },
      { icon: Bot, t: "Nace en una sesión", d: "Cada tarjeta recuerda el agente, la sesión y la carpeta, para retomar la conversación." },
      { icon: Terminal, t: "CLI para agentes", d: "park no tiene dependencias: JSON al encadenar, --dry-run al escribir, park schema para agentes." },
      { icon: KeyRound, t: "Claves de API", d: "Claves Bearer para el CLI, guardadas como hash SHA-256 y creadas desde la web." },
      { icon: Lock, t: "Privado por defecto", d: "Un tablero por usuario y una lista opcional de correos permitidos." },
    ],
    cliTitle: "Desde la terminal",
    cliOut: "parqueada #13 Revisar el cupón con envío gratis (tienda)",
    soonTitle: "El registro aún no está abierto",
    soon: "Esta instancia es privada mientras el inicio de sesión con Google pasa a producción. El código es público: monta tu propio tablero en unos minutos.",
    stack: "Next.js 16 · React 19 · React Flow · Prisma 7 sobre Postgres · Clerk",
    by: "Hecho por",
  },
} as const;

const CLI = {
  en: 'park add "Check the coupon with free shipping" -p shop --kind bug --priority urgent',
  es: 'park add "Revisar el cupón con envío gratis" -p tienda --kind bug --priority urgent',
};

function GitHubMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.2-3.1-.1-.4-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.6.2 2.8.1 3.2.8.8 1.2 1.9 1.2 3.1 0 4.6-2.8 5.6-5.5 6 .4.3.8 1 .8 2.1v3.1c0 .3.2.7.8.6A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

function Logo() {
  return (
    <svg width={26} height={26} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="pb-accent" x1="19" y1="13" x2="49" y2="51" gradientUnits="userSpaceOnUse">
          <stop stopColor="#68ddfd" />
          <stop offset="1" stopColor="#9e8cfc" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#161615" />
      <path
        fill="url(#pb-accent)"
        fillRule="evenodd"
        d="M19 13H34C44 13 49 18 49 27S44 41 34 41H28V51H19ZM28 22V32H34C38 32 40 30 40 27S38 22 34 22Z"
      />
    </svg>
  );
}

export function Landing({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  return (
    <div className="relative min-h-full overflow-x-clip bg-ink">
      {/* Dotted canvas backdrop, like the board */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{ backgroundImage: "radial-gradient(#232323 1px, transparent 1px)", backgroundSize: "22px 22px" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-240px] h-[520px] w-[900px] max-w-[160vw] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{ background: "linear-gradient(90deg, #68ddfd, #9e8cfc)" }}
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <header className="flex h-16 items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-lg font-semibold tracking-tight">
              <span className="text-gradient">Parkboard</span>
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-1.5 text-sm">
            <a
              href={REPO}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-muted transition-colors hover:bg-raised hover:text-fg"
            >
              <GitHubMark size={15} />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <Link
              href="/sign-in"
              className="rounded-lg border border-line px-3 py-1.5 text-muted transition-colors hover:bg-raised hover:text-fg"
            >
              {c.signIn}
            </Link>
          </nav>
        </header>

        <section className="pb-14 pt-16 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel/80 px-3 py-1 font-mono text-[11px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
            {c.badge}
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
            {c.title1} <span className="text-gradient">{c.title2}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">{c.lead}</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={REPO}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-fg px-5 py-2.5 text-sm font-medium text-ink transition-opacity hover:opacity-90 sm:w-auto"
            >
              <GitHubMark />
              {c.github}
            </a>
            <a
              href="#self-host"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-panel/60 px-5 py-2.5 text-sm text-fg transition-colors hover:bg-raised sm:w-auto"
            >
              {c.selfHost}
              <ArrowRight size={15} />
            </a>
          </div>
        </section>

        <div className="rounded-2xl border border-line bg-panel/60 p-1.5 shadow-[0_0_80px_-20px_rgba(104,221,253,0.25)] sm:p-2">
          <Image
            src="/screenshot.png"
            alt={c.shotAlt}
            width={3520}
            height={1520}
            priority
            className="h-auto w-full rounded-xl border border-line"
          />
        </div>

        <section className="mx-auto max-w-3xl py-24 text-center">
          <h2 className="font-mono text-xs uppercase tracking-widest text-faint">{c.whyTitle}</h2>
          <p className="mt-5 text-xl leading-relaxed text-fg/90 sm:text-2xl">{c.why}</p>
        </section>

        <section>
          <h2 className="text-center font-mono text-xs uppercase tracking-widest text-faint">{c.howTitle}</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {c.steps.map((s, i) => (
              <li key={s.t} className="rounded-2xl border border-line bg-panel/70 p-6">
                <span className="font-mono text-xs text-gradient">0{i + 1}</span>
                <h3 className="mt-3 font-semibold tracking-tight">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p>
              </li>
            ))}
          </ol>

          <div className="mx-auto mt-6 max-w-3xl overflow-hidden rounded-2xl border border-line bg-panel">
            <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-line" />
              <span className="h-2.5 w-2.5 rounded-full bg-line" />
              <span className="h-2.5 w-2.5 rounded-full bg-line" />
              <span className="ml-3 font-mono text-[11px] text-faint">{c.cliTitle}</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed">
              <span className="text-faint">$ </span>
              <span className="text-fg">{CLI[lang]}</span>
              {"\n"}
              <span className="text-cyan">✓ </span>
              <span className="text-muted">{c.cliOut}</span>
            </pre>
          </div>
        </section>

        <section className="py-24">
          <h2 className="text-center font-mono text-xs uppercase tracking-widest text-faint">{c.featTitle}</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.feats.map(({ icon: Icon, t, d }) => (
              <div key={t} className="rounded-2xl border border-line bg-panel/70 p-6">
                <Icon size={18} className="text-cyan" />
                <h3 className="mt-4 font-semibold tracking-tight">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="self-host"
          className="scroll-mt-8 rounded-2xl border border-violet/30 bg-panel/70 p-6 sm:p-10"
        >
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{c.soonTitle}</h2>
              <p className="mt-4 leading-relaxed text-muted">{c.soon}</p>
              <a
                href={REPO}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-fg px-5 py-2.5 text-sm font-medium text-ink transition-opacity hover:opacity-90"
              >
                <GitHubMark />
                {c.github}
              </a>
            </div>
            <pre className="overflow-x-auto rounded-xl border border-line bg-ink p-5 font-mono text-[13px] leading-relaxed text-muted">
              <span className="text-faint">$ </span>git clone {REPO}.git{"\n"}
              <span className="text-faint">$ </span>pnpm install{"\n"}
              <span className="text-faint">$ </span>cp .env.example .env{"\n"}
              <span className="text-faint">$ </span>pnpm exec prisma migrate deploy{"\n"}
              <span className="text-faint">$ </span>pnpm dev
            </pre>
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 py-12 text-xs text-faint sm:flex-row">
          <span className="font-mono">{c.stack}</span>
          <span>
            {c.by}{" "}
            <a href="https://jaimeaza.tech" className="text-muted hover:text-fg">
              Jaime Aza
            </a>
          </span>
        </footer>
      </div>
    </div>
  );
}
