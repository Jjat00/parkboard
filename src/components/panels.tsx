"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, CircleCheck, Copy, ExternalLink, Trash2, X } from "lucide-react";
import { api, type ApiKeyDTO } from "@/lib/api";
import { labels, type AreaKey } from "@/lib/labels";
import { LOCALE } from "@/lib/lang-shared";
import { useLang } from "@/components/lang";
import { githubRepo } from "@/lib/repo";
import { AGENT_LABEL, resumeCommand } from "@/lib/session";
import { ago, dayLabel } from "@/lib/time";
import type { CardDTO, Link, ProjectDTO } from "@/lib/types";

const COLORS = ["#68ddfd", "#9e8cfc", "#f5d90a", "#4ade80", "#fb7185", "#fb923c"];

const COPY = {
  es: {
    close: "Cerrar",
    origin: "Origen",
    session: (id: string) => `sesión ${id}`,
    copied: "Copiado",
    copyResume: "Copiar comando para retomar la sesión",
    ref: (n: number, title: string) => `#${n} ${title} de parkboard`,
    refHint: "Copia «#número título de parkboard» para pedirle algo a un agente",
    copyRef: "Copiar referencia",
    saveFailed: "No se pudo guardar",
    notSaved: (error: string) => `No se guardó el último cambio (${error}). Vuelve a intentarlo.`,
    card: (n: number) => `Tarjeta #${n}`,
    status: "Estado",
    priority: "Prioridad",
    kind: "Tipo",
    project: "Proyecto",
    loose: "Ideas sueltas",
    area: "Área",
    noArea: "Sin área",
    notes: "Notas",
    notesPlaceholder: "Contexto, próximos pasos, por qué quedó para después…",
    tags: "Etiquetas (separadas por coma)",
    links: "Enlaces",
    removeLink: "Quitar enlace",
    linkPlaceholder: "https://… y Enter",
    summary: "Resumen de la conversación",
    summaryPlaceholder: "Qué se estaba haciendo cuando quedó para después",
    vaultNote: "Nota del vault",
    vaultPlaceholder: "Ideas/Nombre de la nota",
    repo: "Repositorio de GitHub",
    repoPlaceholder: "owner/nombre o la URL del repo",
    confirmDeleteCard: "¿Borrar esta tarjeta?",
    deleteCard: "Borrar tarjeta",
    color: "Color",
    confirmDeleteProject: "¿Borrar el proyecto? Sus tarjetas pasan a Ideas sueltas.",
    deleteProject: "Borrar proyecto",
    keysTitle: "Claves para el CLI y los agentes",
    keysLead1: "Cada clave actúa como tú sobre tu tablero. Úsala con el CLI",
    keysLead2: "o desde tus agentes. Lo más fácil es correr",
    keysLead3: "en la terminal; crea aquí una clave a mano solo para una máquina sin navegador.",
    keyName: "Nombre: laptop, codex…",
    create: "Crear",
    copyNow: "Cópiala ahora: no se vuelve a mostrar.",
    copyCommand: "Copiar comando",
    loading: "Cargando…",
    noKeys: "Aún no tienes claves.",
    used: (date: string) => `usada ${date}`,
    unused: "sin usar",
    confirmRevoke: (name: string) => `¿Revocar la clave «${name}»? Lo que la use dejará de funcionar.`,
    revoke: "Revocar",
    doneTitle: "Hechas",
    search: "Buscar en lo terminado",
    noneDone: "Todavía no hay tareas terminadas.",
    took: (span: string) => ` · tomó ${span}`,
    /** "hace 3 d" → "3 d"; null for words like "ayer" that do not read as a duration. */
    span: (ago: string) => (ago.startsWith("hace ") ? ago.slice(5) : null),
    reopen: "Reabrir",
  },
  en: {
    close: "Close",
    origin: "Origin",
    session: (id: string) => `session ${id}`,
    copied: "Copied",
    copyResume: "Copy command to resume the session",
    ref: (n: number, title: string) => `#${n} ${title} from parkboard`,
    refHint: "Copies “#number title from parkboard” to hand the card to an agent",
    copyRef: "Copy reference",
    saveFailed: "Could not save",
    notSaved: (error: string) => `Your last change was not saved (${error}). Try again.`,
    card: (n: number) => `Card #${n}`,
    status: "Status",
    priority: "Priority",
    kind: "Type",
    project: "Project",
    loose: "Loose ideas",
    area: "Area",
    noArea: "No area",
    notes: "Notes",
    notesPlaceholder: "Context, next steps, why it was parked…",
    tags: "Tags (comma-separated)",
    links: "Links",
    removeLink: "Remove link",
    linkPlaceholder: "https://… and Enter",
    summary: "Conversation summary",
    summaryPlaceholder: "What was going on when it was parked",
    vaultNote: "Vault note",
    vaultPlaceholder: "Ideas/Note name",
    repo: "GitHub repository",
    repoPlaceholder: "owner/name or the repo URL",
    confirmDeleteCard: "Delete this card?",
    deleteCard: "Delete card",
    color: "Color",
    confirmDeleteProject: "Delete the project? Its cards move to Loose ideas.",
    deleteProject: "Delete project",
    keysTitle: "Keys for the CLI and agents",
    keysLead1: "Each key acts as you on your board. Use it with the",
    keysLead2: "CLI or from your agents. The easiest way is to run",
    keysLead3: "in your terminal; only create a key by hand here for a machine without a browser.",
    keyName: "Name: laptop, codex…",
    create: "Create",
    copyNow: "Copy it now: it won't be shown again.",
    copyCommand: "Copy command",
    loading: "Loading…",
    noKeys: "No keys yet.",
    used: (date: string) => `used ${date}`,
    unused: "never used",
    confirmRevoke: (name: string) => `Revoke the key “${name}”? Anything using it will stop working.`,
    revoke: "Revoke",
    doneTitle: "Done",
    search: "Search finished cards",
    noneDone: "No finished tasks yet.",
    took: (span: string) => ` · took ${span}`,
    /** "3d ago" → "3d"; null for words like "yesterday" that do not read as a duration. */
    span: (ago: string) => (ago.endsWith(" ago") ? ago.slice(0, -4) : null),
    reopen: "Reopen",
  },
} as const;

function Shell({
  title,
  onClose,
  children,
  actions,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const c = COPY[useLang()];
  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[400px] flex-col border-l border-line bg-ink/95 backdrop-blur">
      <div className="flex items-center border-b border-line px-5 py-3">
        <span className="font-mono text-[11px] tracking-wider text-faint uppercase">{title}</span>
        <div className="ml-auto mr-3 flex items-center gap-2">{actions}</div>
        <button onClick={onClose} className="text-faint hover:text-fg" aria-label={c.close}>
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">{children}</div>
    </aside>
  );
}

type TextKey = "title" | "notes" | "session" | "vaultNote" | "repo" | "tagsText";
type Draft = Omit<CardDTO, "session" | "vaultNote" | "repo"> & { session: string; vaultNote: string; repo: string; tagsText: string };

const toDraft = (card: CardDTO): Draft => ({
  ...card,
  session: card.session ?? "",
  vaultNote: card.vaultNote ?? "",
  repo: card.repo ?? "",
  tagsText: card.tags.join(", "),
});

/** The API body for one edited text field. Optional texts become null when emptied; notes stay "". */
function textPatch(key: TextKey, value: string): Parameters<typeof api.updateCard>[1] {
  switch (key) {
    case "title":
      return { title: value.trim() };
    case "notes":
      return { notes: value };
    case "session":
      return { session: value.trim() ? value : null };
    case "vaultNote":
      return { vaultNote: value.trim() ? value.trim() : null };
    case "repo":
      // A pasted GitHub URL is saved as owner/name; anything else goes as typed and the API rejects it.
      return { repo: value.trim() ? (githubRepo(value) ?? value.trim()) : null };
    case "tagsText":
      return { tags: value.split(",").map((t) => t.trim()).filter(Boolean) };
  }
}

function SessionBox({ card }: { card: CardDTO }) {
  const lang = useLang();
  const c = COPY[lang];
  const [copied, setCopied] = useState(false);
  const command = resumeCommand(card);
  return (
    <div className="space-y-2.5 rounded-xl border border-line bg-panel/60 p-4">
      <div className="flex items-center gap-2 text-[11px] text-faint">
        <Bot size={13} />
        <span>{c.origin}</span>
        <span className="ml-auto font-mono">{new Date(card.createdAt).toLocaleString(LOCALE[lang])}</span>
      </div>
      <p className="text-sm text-fg">
        {card.agent ? (AGENT_LABEL[card.agent] ?? card.agent) : card.origin}
        {card.cwd && <span className="ml-2 font-mono text-[11px] text-faint">{card.cwd}</span>}
      </p>
      {card.sessionId && <p className="font-mono text-[11px] break-all text-muted">{c.session(card.sessionId)}</p>}
      {command && (
        <div className="space-y-1.5">
          <pre className="overflow-x-auto rounded-lg bg-ink p-2.5 font-mono text-[11px] whitespace-pre-wrap text-fg">{command}</pre>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(command);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="flex items-center gap-1.5 text-xs text-cyan hover:underline"
          >
            <Copy size={12} /> {copied ? c.copied : c.copyResume}
          </button>
        </div>
      )}
    </div>
  );
}

/** Copies "#12 Title de parkboard" ("from parkboard" in English): the easiest way to point an agent at a card, and it says where it lives. */
function CopyRef({ card }: { card: CardDTO }) {
  const c = COPY[useLang()];
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(c.ref(card.number, card.title));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1 text-[11px] text-faint hover:text-cyan"
      title={c.refHint}
    >
      <Copy size={12} /> {copied ? c.copied : c.copyRef}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] text-faint">{label}</span>
      {children}
    </label>
  );
}

const input =
  "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg outline-none placeholder:text-faint focus:border-cyan/60";

function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className={input}>
      {(Object.keys(options) as T[]).map((k) => (
        <option key={k} value={k}>
          {options[k]}
        </option>
      ))}
    </select>
  );
}

export function CardPanel({
  card,
  projects,
  onSaved,
  onDeleted,
  onClose,
  track,
  serial,
}: {
  card: CardDTO;
  projects: ProjectDTO[];
  onSaved: (c: CardDTO) => void;
  /** Registers a write with the board so a refresh started meanwhile is discarded. */
  track: <T>(p: Promise<T>) => Promise<T>;
  /** Runs writes to the same card one after another (see the board). */
  serial: <T>(key: string, task: () => Promise<T>) => Promise<T>;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  // Text fields are edited locally and saved on blur. `dirty` marks fields with local edits:
  // updates from the board (a save response, the 20 s refresh, an agent's edit) replace every
  // field except those, so neither side silently overwrites the other.
  const lang = useLang();
  const c = COPY[lang];
  const L = labels(lang);
  const [draft, setDraft] = useState(() => toDraft(card));
  const [dirty, setDirty] = useState<ReadonlySet<TextKey>>(new Set());
  const [synced, setSynced] = useState(card);
  const [error, setError] = useState<string | null>(null);
  const [newLink, setNewLink] = useState("");

  if (card !== synced) {
    setSynced(card);
    setDraft((d) => {
      const next = toDraft(card);
      for (const k of dirty) (next as Record<TextKey, string>)[k] = d[k];
      return next;
    });
  }

  const draftRef = useRef(draft);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    draftRef.current = draft;
    dirtyRef.current = dirty;
  }, [draft, dirty]);

  // Saves run one after another in the board's chain for this card, which outlives the panel:
  // edits made before closing and after reopening still reach the server in order, and each
  // text save sends the field's latest value when its turn comes.
  const enqueue = (task: () => Promise<unknown>) => void serial(`card:${card.id}`, task);

  const send = async (patch: Parameters<typeof api.updateCard>[1]) => {
    try {
      const { card: saved } = await track(api.updateCard(card.id, patch));
      setError(null);
      onSaved(saved);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : c.saveFailed);
      return false;
    }
  };

  const edit = (key: TextKey, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty((s) => new Set(s).add(key));
  };

  const clean = (key: TextKey) =>
    setDirty((s) => {
      const next = new Set(s);
      next.delete(key);
      return next;
    });

  const commit = (key: TextKey) =>
    enqueue(async () => {
      if (!dirtyRef.current.has(key)) return;
      const value = draftRef.current[key];
      if (key === "title" && !value.trim()) {
        // A card needs a title: drop the empty edit instead of sending an invalid save.
        setDraft((d) => ({ ...d, title: card.title }));
        clean("title");
        return;
      }
      const ok = await send(textPatch(key, value));
      // Keep the field dirty if it changed again while the request was in flight.
      if (ok && draftRef.current[key] === value) clean(key);
    });

  /** Selects, links and other one-click changes save right away, in the same queue. */
  const save = (patch: Parameters<typeof api.updateCard>[1]) => enqueue(() => send(patch));

  const priorityLabels = Object.fromEntries(Object.entries(L.PRIORITY).map(([k, v]) => [k, v.label])) as Record<
    keyof typeof L.PRIORITY,
    string
  >;

  return (
    <Shell title={c.card(card.number)} onClose={onClose} actions={<CopyRef card={card} />}>
      {error && (
        <p className="rounded-lg border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-xs text-[#fb7185]">
          {c.notSaved(error)}
        </p>
      )}
      <textarea
        value={draft.title}
        onChange={(e) => edit("title", e.target.value)}
        onBlur={() => commit("title")}
        rows={2}
        className="w-full resize-none bg-transparent text-lg leading-snug font-semibold text-fg outline-none"
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label={c.status}>
          <Select value={draft.status} options={L.STATUS} onChange={(status) => save({ status })} />
        </Field>
        <Field label={c.priority}>
          <Select value={draft.priority} options={priorityLabels} onChange={(priority) => save({ priority })} />
        </Field>
        <Field label={c.kind}>
          <Select value={draft.kind} options={L.KIND} onChange={(kind) => save({ kind })} />
        </Field>
        <Field label={c.project}>
          <select
            value={draft.projectId ?? ""}
            onChange={(e) => save({ project: e.target.value || null })}
            className={input}
          >
            <option value="">{c.loose}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {!draft.projectId && (
          <Field label={c.area}>
            <select
              value={draft.area ?? ""}
              onChange={(e) => save({ area: (e.target.value || null) as AreaKey | null })}
              className={input}
            >
              <option value="">{c.noArea}</option>
              <option value="PERSONAL">{L.AREA.PERSONAL}</option>
              <option value="WORK">{L.AREA.WORK}</option>
            </select>
          </Field>
        )}
      </div>

      <Field label={c.notes}>
        <textarea
          value={draft.notes}
          onChange={(e) => edit("notes", e.target.value)}
          onBlur={() => commit("notes")}
          rows={7}
          placeholder={c.notesPlaceholder}
          className={`${input} resize-y font-mono text-[13px]`}
        />
      </Field>

      <Field label={c.tags}>
        <input
          value={draft.tagsText}
          onChange={(e) => edit("tagsText", e.target.value)}
          onBlur={() => commit("tagsText")}
          className={input}
        />
      </Field>

      <div className="space-y-2">
        <span className="text-[11px] text-faint">{c.links}</span>
        {draft.links.map((l, i) => (
          <div key={`${l.url}-${i}`} className="flex items-center gap-2 text-sm">
            <a href={l.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-1.5 text-cyan hover:underline">
              <ExternalLink size={13} className="shrink-0" />
              <span className="truncate">{l.label || l.url}</span>
            </a>
            <button
              onClick={() => save({ links: draft.links.filter((_, j) => j !== i) })}
              className="text-faint hover:text-[#fb7185]"
              aria-label={c.removeLink}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const url = new URL(newLink.trim()).toString();
              save({ links: [...draft.links, { url } as Link] });
              setNewLink("");
            } catch {
              /* not a URL */
            }
          }}
        >
          <input value={newLink} onChange={(e) => setNewLink(e.target.value)} placeholder={c.linkPlaceholder} className={input} />
        </form>
      </div>

      <SessionBox card={draft} />

      <div className="space-y-3 rounded-xl border border-line bg-panel/60 p-4">
        <Field label={c.summary}>
          <textarea
            value={draft.session ?? ""}
            onChange={(e) => edit("session", e.target.value)}
            onBlur={() => commit("session")}
            rows={3}
            placeholder={c.summaryPlaceholder}
            className={`${input} resize-y text-xs`}
          />
        </Field>
        <Field label={c.vaultNote}>
          <input
            value={draft.vaultNote ?? ""}
            onChange={(e) => edit("vaultNote", e.target.value)}
            onBlur={() => commit("vaultNote")}
            placeholder={c.vaultPlaceholder}
            className={`${input} font-mono text-xs`}
          />
        </Field>
        <Field label={c.repo}>
          <input
            value={draft.repo ?? ""}
            onChange={(e) => edit("repo", e.target.value)}
            onBlur={() => commit("repo")}
            placeholder={c.repoPlaceholder}
            className={`${input} font-mono text-xs`}
          />
        </Field>
      </div>

      <button
        onClick={async () => {
          if (!confirm(c.confirmDeleteCard)) return;
          await api.deleteCard(card.id);
          onDeleted(card.id);
        }}
        className="flex items-center gap-2 text-xs text-faint hover:text-[#fb7185]"
      >
        <Trash2 size={14} /> {c.deleteCard}
      </button>
    </Shell>
  );
}

export function ProjectPanel({
  project,
  onSave,
  onDeleted,
  onClose,
  track,
}: {
  project: ProjectDTO;
  onSave: (patch: Partial<ProjectDTO>) => void;
  onDeleted: (project: ProjectDTO) => void;
  onClose: () => void;
  track: <T>(p: Promise<T>) => Promise<T>;
}) {
  const lang = useLang();
  const c = COPY[lang];
  const L = labels(lang);
  const [name, setName] = useState(project.name);
  return (
    <Shell title={c.project} onClose={onClose}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== project.name && onSave({ name: name.trim() })}
        className="w-full bg-transparent text-lg font-semibold text-fg outline-none"
      />
      <Field label={c.area}>
        <Select value={project.area} options={L.AREA} onChange={(area: AreaKey) => onSave({ area })} />
      </Field>
      <div className="space-y-2">
        <span className="text-[11px] text-faint">{c.color}</span>
        <div className="flex gap-2">
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => onSave({ color })}
              className={`h-7 w-7 rounded-full border-2 ${project.color === color ? "border-fg" : "border-transparent"}`}
              style={{ background: color }}
              aria-label={color}
            />
          ))}
        </div>
      </div>
      <p className="font-mono text-xs text-faint">slug: {project.slug}</p>
      <button
        onClick={async () => {
          if (!confirm(c.confirmDeleteProject)) return;
          await track(api.deleteProject(project.id));
          onDeleted(project);
        }}
        className="flex items-center gap-2 text-xs text-faint hover:text-[#fb7185]"
      >
        <Trash2 size={14} /> {c.deleteProject}
      </button>
    </Shell>
  );
}

export function KeysPanel({ onClose }: { onClose: () => void }) {
  const lang = useLang();
  const c = COPY[lang];
  const [keys, setKeys] = useState<ApiKeyDTO[] | null>(null);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  useEffect(() => {
    api.keys().then(({ keys }) => setKeys(keys)).catch(console.error);
  }, []);

  return (
    <Shell title={c.keysTitle} onClose={onClose}>
      <p className="text-sm text-muted">
        {c.keysLead1} <code className="font-mono text-cyan">park</code> {c.keysLead2}{" "}
        <code className="font-mono text-cyan">park login</code> {c.keysLead3}
      </p>

      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const { key, secret } = await api.createKey(name.trim());
          setKeys((k) => [key, ...(k ?? [])]);
          setSecret(secret);
          setName("");
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={c.keyName} className={input} />
        <button className="shrink-0 rounded-lg bg-white px-3 text-sm font-medium text-ink hover:bg-zinc-200">{c.create}</button>
      </form>

      {secret && (
        <div className="space-y-2 rounded-xl border border-sun/40 bg-sun/5 p-4">
          <p className="text-xs text-sun">{c.copyNow}</p>
          <pre className="overflow-x-auto rounded-lg bg-ink p-3 font-mono text-[11px] whitespace-pre-wrap text-fg">
            {`park config --url ${origin} --key ${secret}`}
          </pre>
          <button
            onClick={() => navigator.clipboard.writeText(`park config --url ${origin} --key ${secret}`)}
            className="text-xs text-cyan hover:underline"
          >
            {c.copyCommand}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {keys === null && <p className="text-xs text-faint">{c.loading}</p>}
        {keys?.length === 0 && <p className="text-xs text-faint">{c.noKeys}</p>}
        {keys?.map((k) => (
          <div key={k.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-fg">{k.name}</p>
              <p className="font-mono text-[11px] text-faint">
                {k.prefix}… · {k.lastUsedAt ? c.used(new Date(k.lastUsedAt).toLocaleDateString(LOCALE[lang])) : c.unused}
              </p>
            </div>
            <button
              onClick={async () => {
                if (!confirm(c.confirmRevoke(k.name))) return;
                await api.revokeKey(k.id);
                setKeys((ks) => ks?.filter((x) => x.id !== k.id) ?? null);
              }}
              className="text-xs text-faint hover:text-[#fb7185]"
            >
              {c.revoke}
            </button>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function DonePanel({
  cards,
  projects,
  onOpen,
  onReopen,
  onClose,
}: {
  cards: CardDTO[];
  projects: ProjectDTO[];
  onOpen: (id: string) => void;
  onReopen: (card: CardDTO) => void;
  onClose: () => void;
}) {
  const lang = useLang();
  const t = COPY[lang];
  const [q, setQ] = useState("");
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const done = cards
    .filter((c) => c.status === "DONE")
    .filter((c) => !q.trim() || `${c.title} ${c.notes}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (b.doneAt ?? b.updatedAt).localeCompare(a.doneAt ?? a.updatedAt));
  const groups = new Map<string, CardDTO[]>();
  for (const c of done) {
    const label = dayLabel(c.doneAt ?? c.updatedAt, lang);
    groups.set(label, [...(groups.get(label) ?? []), c]);
  }

  return (
    <Shell title={t.doneTitle} onClose={onClose}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className={input} />
      {done.length === 0 && <p className="text-sm text-faint">{t.noneDone}</p>}
      {[...groups].map(([label, items]) => (
        <section key={label} className="space-y-1.5">
          <h3 className="text-[11px] text-faint first-letter:uppercase">{label}</h3>
          {items.map((c) => {
            const took = c.doneAt ? t.span(ago(c.createdAt, lang, new Date(c.doneAt).getTime())) : null;
            return (
              <div key={c.id} className="group flex items-start gap-2 rounded-lg border border-line px-3 py-2 hover:bg-raised">
                <CircleCheck size={14} className="mt-0.5 shrink-0 text-[#4ade80]" />
                <button onClick={() => onOpen(c.id)} className="min-w-0 flex-1 text-left">
                  <p className="text-[13px] leading-snug text-fg">
                    <span className="font-mono text-faint">#{c.number}</span> {c.title}
                  </p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-faint">
                    {c.projectId ? names.get(c.projectId) : t.loose}
                    {took && t.took(took)}
                  </p>
                </button>
                <button
                  onClick={() => onReopen(c)}
                  className="shrink-0 text-[11px] text-faint opacity-0 group-hover:opacity-100 hover:text-cyan"
                >
                  {t.reopen}
                </button>
              </div>
            );
          })}
        </section>
      ))}
    </Shell>
  );
}
