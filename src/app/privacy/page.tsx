import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { preferredLang } from "@/lib/lang";

const REPO = "https://github.com/Jjat00/parkboard";
const CONTACT = "contacto@jato.run";

type Section = { t: string; p?: string[]; li?: string[] };

const COPY = {
  en: {
    meta: "What Parkboard stores, how it is encrypted and who can see it.",
    back: "Back",
    title: "Privacy",
    updated: "Effective October 14, 2026",
    intro: [
      "This page explains what Parkboard stores, how it protects it and who can see it. It adds to the",
      "general jato.run privacy policy",
      ", which covers every *.jato.run app.",
    ],
    general: "https://jato.run/en/privacy/",
    sections: [
      {
        t: "What we store",
        li: [
          "Your account: the email, name and picture Google shares when you sign in, managed by Clerk.",
          "What you park: titles, notes, links, tags and project names. When an agent parks a card, also the session summary, its id, the working folder and the vault note.",
          "Board metadata: status, priority, kind, area, canvas positions, colors, dates and which agent created each card.",
          "API keys: only their SHA-256 hash, never the key itself.",
        ],
      },
      {
        t: "How it is protected",
        li: [
          "Everything you write (titles, notes, links, tags, project names, origin, session summary and id, folder and vault note) is encrypted with AES-256-GCM before it reaches the database. The key lives outside the database, so a copy of the database or of its backups cannot be read without it.",
          "Encryption started on October 14, 2026. Backups taken before that date may still hold that text in clear until the provider deletes them under its retention.",
          "Each value is bound to your account and its field: it cannot be moved into someone else’s account and read there.",
          "Traffic goes over HTTPS, and each user only ever sees their own board.",
          "Not encrypted: the board metadata above (including the name of the agent that created a card), which the server needs to sort and draw the board, and the name you give each API key.",
        ],
      },
      {
        t: "Who can see it",
        p: [
          "Encryption happens on the server: the app decrypts your cards to show them to you, so whoever runs the service technically holds the key. We will not open the contents of your board unless you ask us to (for example, to fix a support issue) or a competent authority requires it, and we will tell you when the law allows.",
          "We do not sell or share your data, there are no ads or third-party analytics, and your data is not used to train AI models.",
        ],
      },
      {
        t: "Providers",
        li: [
          "Clerk: sign-in and accounts.",
          "Google: sign-in with your Google account.",
          "Vercel: hosts the app.",
          "Railway: hosts the database, which only holds the encrypted text.",
        ],
      },
      {
        t: "Cookies and local storage",
        p: [
          "Only Clerk’s session cookies. Your browser also remembers the view and sort order you picked (localStorage). No tracking cookies.",
        ],
      },
      {
        t: "Your rights",
        p: [
          "Under Colombia’s Law 1581 of 2012 and, if you are in the EU, the GDPR, you can access, correct, export and delete your data. Edit or delete cards and projects from the board or the CLI; `park export` saves your whole board as JSON. To delete your whole account, write to " +
            CONTACT +
            " and we will do it within 15 business days. Database backups expire on the provider’s normal cycle.",
        ],
      },
      {
        t: "Rather not trust anyone?",
        p: ["The code is public. Run your own Parkboard on your own servers, with your own key."],
      },
      {
        t: "Changes",
        p: ["If something important changes, this page will say so, with a new date."],
      },
    ] satisfies Section[],
    owner: "Controller: Jaime Aza (jato.run) ·",
    repo: "Source code",
  },
  es: {
    meta: "Qué guarda Parkboard, cómo lo cifra y quién puede verlo.",
    back: "Volver",
    title: "Privacidad",
    updated: "Vigente desde el 14 de octubre de 2026",
    intro: [
      "Esta página explica qué guarda Parkboard, cómo lo protege y quién puede verlo. Complementa la",
      "política de privacidad general de jato.run",
      ", que cubre todas las apps *.jato.run.",
    ],
    general: "https://jato.run/privacidad/",
    sections: [
      {
        t: "Qué guardamos",
        li: [
          "Tu cuenta: el correo, el nombre y la foto que entrega Google al iniciar sesión, gestionados por Clerk.",
          "Lo que parqueas: títulos, notas, enlaces, etiquetas y nombres de proyecto. Si una tarjeta la crea un agente, también el resumen de la sesión, su id, la carpeta de trabajo y la nota del vault.",
          "Datos del tablero: estado, prioridad, tipo, área, posiciones en el lienzo, colores, fechas y qué agente creó cada tarjeta.",
          "Claves de API: solo su hash SHA-256, nunca la clave.",
        ],
      },
      {
        t: "Cómo lo protegemos",
        li: [
          "Todo lo que escribes (títulos, notas, enlaces, etiquetas, nombres de proyecto, origen, resumen e id de la sesión, carpeta y nota del vault) se cifra con AES-256-GCM antes de llegar a la base de datos. La clave vive fuera de la base, así que una copia de la base o de sus backups no sirve para leerlo sin ella.",
          "El cifrado empezó el 14 de octubre de 2026. Las copias de seguridad anteriores a esa fecha pueden conservar ese texto sin cifrar hasta que el proveedor las borre según su retención.",
          "Cada valor queda atado a tu cuenta y a su campo: no se puede mover a la cuenta de otra persona y leerlo ahí.",
          "La conexión va por HTTPS y cada usuario solo ve su propio tablero.",
          "Sin cifrar quedan los datos del tablero de arriba (incluido el nombre del agente que creó cada tarjeta), que el servidor necesita para ordenar y dibujar el lienzo, y el nombre que le pones a cada clave de API.",
        ],
      },
      {
        t: "Quién puede verlo",
        p: [
          "El cifrado ocurre en el servidor: la aplicación descifra tus tarjetas para mostrártelas, así que quien opera el servicio tiene técnicamente la clave. No abriremos el contenido de tu tablero salvo que tú lo pidas (por ejemplo, para resolver un problema de soporte) o lo exija una autoridad competente, y te avisaremos cuando la ley lo permita.",
          "No vendemos ni compartimos tus datos, no hay publicidad ni analítica de terceros y tus datos no se usan para entrenar modelos de IA.",
        ],
      },
      {
        t: "Proveedores",
        li: [
          "Clerk: inicio de sesión y cuentas.",
          "Google: inicio de sesión con tu cuenta de Google.",
          "Vercel: aloja la aplicación.",
          "Railway: aloja la base de datos, que solo guarda el texto cifrado.",
        ],
      },
      {
        t: "Cookies y almacenamiento local",
        p: [
          "Solo las cookies de sesión de Clerk. Tu navegador además recuerda la vista y el orden que elegiste (localStorage). Sin cookies de seguimiento.",
        ],
      },
      {
        t: "Tus derechos",
        p: [
          "Según la Ley 1581 de 2012 de Colombia y, si estás en la Unión Europea, el RGPD, puedes acceder a tus datos, corregirlos, exportarlos y borrarlos. Edita o borra tarjetas y proyectos desde el tablero o el CLI; `park export` guarda tu tablero completo en JSON. Para borrar tu cuenta completa, escribe a " +
            CONTACT +
            " y lo haremos en máximo 15 días hábiles. Las copias de seguridad de la base vencen en el ciclo normal del proveedor.",
        ],
      },
      {
        t: "¿Prefieres no confiar en nadie?",
        p: ["El código es público. Monta tu propio Parkboard en tus servidores, con tu propia clave."],
      },
      {
        t: "Cambios",
        p: ["Si cambia algo importante, lo dirá esta página, con una fecha nueva."],
      },
    ] satisfies Section[],
    owner: "Responsable: Jaime Aza (jato.run) ·",
    repo: "Código fuente",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const c = COPY[await preferredLang()];
  return { title: `${c.title} · Parkboard`, description: c.meta, robots: { index: true, follow: true } };
}

export default async function Privacy() {
  const c = COPY[await preferredLang()];
  return (
    <div className="min-h-full bg-ink">
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft size={15} />
          {c.back}
        </Link>
        <h1 className="mt-8 text-4xl font-semibold tracking-tight">
          <span className="text-gradient">{c.title}</span>
        </h1>
        <p className="mt-2 font-mono text-xs text-faint">{c.updated}</p>
        <p className="mt-6 leading-relaxed text-muted">
          {c.intro[0]}{" "}
          <a href={c.general} className="text-fg underline decoration-line underline-offset-4 hover:decoration-cyan">
            {c.intro[1]}
          </a>
          {c.intro[2]}
        </p>
        {c.sections.map((s: Section) => (
          <section key={s.t} className="mt-10">
            <h2 className="text-lg font-semibold tracking-tight">{s.t}</h2>
            {s.p?.map((p) => (
              <p key={p} className="mt-3 leading-relaxed text-muted">
                {p}
              </p>
            ))}
            {s.li && (
              <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-muted marker:text-faint">
                {s.li.map((li) => (
                  <li key={li}>{li}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <footer className="mt-14 border-t border-line pt-6 text-xs text-faint">
          {c.owner}{" "}
          <a href={`mailto:${CONTACT}`} className="text-muted hover:text-fg">
            {CONTACT}
          </a>{" "}
          ·{" "}
          <a href={REPO} className="text-muted hover:text-fg">
            {c.repo}
          </a>
        </footer>
      </main>
    </div>
  );
}
