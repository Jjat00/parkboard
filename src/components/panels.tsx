"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, CircleCheck, Copy, ExternalLink, Trash2, X } from "lucide-react";
import { api, type ApiKeyDTO } from "@/lib/api";
import { AREA, KIND, PRIORITY, STATUS, type AreaKey } from "@/lib/labels";
import { AGENT_LABEL, resumeCommand } from "@/lib/session";
import { ago, dayLabel } from "@/lib/time";
import type { CardDTO, Link, ProjectDTO } from "@/lib/types";

const COLORS = ["#68ddfd", "#9e8cfc", "#f5d90a", "#4ade80", "#fb7185", "#fb923c"];

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
  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[400px] flex-col border-l border-line bg-ink/95 backdrop-blur">
      <div className="flex items-center border-b border-line px-5 py-3">
        <span className="font-mono text-[11px] tracking-wider text-faint uppercase">{title}</span>
        <div className="ml-auto mr-3 flex items-center gap-2">{actions}</div>
        <button onClick={onClose} className="text-faint hover:text-fg" aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">{children}</div>
    </aside>
  );
}

type TextKey = "title" | "notes" | "session" | "vaultNote" | "tagsText";
type Draft = Omit<CardDTO, "session" | "vaultNote"> & { session: string; vaultNote: string; tagsText: string };

const toDraft = (card: CardDTO): Draft => ({
  ...card,
  session: card.session ?? "",
  vaultNote: card.vaultNote ?? "",
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
    case "tagsText":
      return { tags: value.split(",").map((t) => t.trim()).filter(Boolean) };
  }
}

function SessionBox({ card }: { card: CardDTO }) {
  const [copied, setCopied] = useState(false);
  const command = resumeCommand(card);
  return (
    <div className="space-y-2.5 rounded-xl border border-line bg-panel/60 p-4">
      <div className="flex items-center gap-2 text-[11px] text-faint">
        <Bot size={13} />
        <span>Origen</span>
        <span className="ml-auto font-mono">{new Date(card.createdAt).toLocaleString("es-CO")}</span>
      </div>
      <p className="text-sm text-fg">
        {card.agent ? (AGENT_LABEL[card.agent] ?? card.agent) : card.origin}
        {card.cwd && <span className="ml-2 font-mono text-[11px] text-faint">{card.cwd}</span>}
      </p>
      {card.sessionId && <p className="font-mono text-[11px] break-all text-muted">sesión {card.sessionId}</p>}
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
            <Copy size={12} /> {copied ? "Copiado" : "Copiar comando para retomar la sesión"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Copies "#12 Title de parkboard": the easiest way to point an agent at a card, and it says where it lives. */
function CopyRef({ card }: { card: CardDTO }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(`#${card.number} ${card.title} de parkboard`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1 text-[11px] text-faint hover:text-cyan"
      title="Copia «#número título de parkboard» para pedirle algo a un agente"
    >
      <Copy size={12} /> {copied ? "Copiado" : "Copiar referencia"}
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
      setError(e instanceof Error ? e.message : "No se pudo guardar");
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

  const priorityLabels = Object.fromEntries(Object.entries(PRIORITY).map(([k, v]) => [k, v.label])) as Record<
    keyof typeof PRIORITY,
    string
  >;

  return (
    <Shell title={`Tarjeta #${card.number}`} onClose={onClose} actions={<CopyRef card={card} />}>
      {error && (
        <p className="rounded-lg border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-xs text-[#fb7185]">
          No se guardó el último cambio ({error}). Vuelve a intentarlo.
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
        <Field label="Estado">
          <Select value={draft.status} options={STATUS} onChange={(status) => save({ status })} />
        </Field>
        <Field label="Prioridad">
          <Select value={draft.priority} options={priorityLabels} onChange={(priority) => save({ priority })} />
        </Field>
        <Field label="Tipo">
          <Select value={draft.kind} options={KIND} onChange={(kind) => save({ kind })} />
        </Field>
        <Field label="Proyecto">
          <select
            value={draft.projectId ?? ""}
            onChange={(e) => save({ project: e.target.value || null })}
            className={input}
          >
            <option value="">Ideas sueltas</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {!draft.projectId && (
          <Field label="Área">
            <select
              value={draft.area ?? ""}
              onChange={(e) => save({ area: (e.target.value || null) as AreaKey | null })}
              className={input}
            >
              <option value="">Sin área</option>
              <option value="PERSONAL">{AREA.PERSONAL}</option>
              <option value="WORK">{AREA.WORK}</option>
            </select>
          </Field>
        )}
      </div>

      <Field label="Notas">
        <textarea
          value={draft.notes}
          onChange={(e) => edit("notes", e.target.value)}
          onBlur={() => commit("notes")}
          rows={7}
          placeholder="Contexto, próximos pasos, por qué quedó para después…"
          className={`${input} resize-y font-mono text-[13px]`}
        />
      </Field>

      <Field label="Etiquetas (separadas por coma)">
        <input
          value={draft.tagsText}
          onChange={(e) => edit("tagsText", e.target.value)}
          onBlur={() => commit("tagsText")}
          className={input}
        />
      </Field>

      <div className="space-y-2">
        <span className="text-[11px] text-faint">Enlaces</span>
        {draft.links.map((l, i) => (
          <div key={`${l.url}-${i}`} className="flex items-center gap-2 text-sm">
            <a href={l.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-1.5 text-cyan hover:underline">
              <ExternalLink size={13} className="shrink-0" />
              <span className="truncate">{l.label || l.url}</span>
            </a>
            <button
              onClick={() => save({ links: draft.links.filter((_, j) => j !== i) })}
              className="text-faint hover:text-[#fb7185]"
              aria-label="Quitar enlace"
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
          <input value={newLink} onChange={(e) => setNewLink(e.target.value)} placeholder="https://… y Enter" className={input} />
        </form>
      </div>

      <SessionBox card={draft} />

      <div className="space-y-3 rounded-xl border border-line bg-panel/60 p-4">
        <Field label="Resumen de la conversación">
          <textarea
            value={draft.session ?? ""}
            onChange={(e) => edit("session", e.target.value)}
            onBlur={() => commit("session")}
            rows={3}
            placeholder="Qué se estaba haciendo cuando quedó para después"
            className={`${input} resize-y text-xs`}
          />
        </Field>
        <Field label="Nota del vault">
          <input
            value={draft.vaultNote ?? ""}
            onChange={(e) => edit("vaultNote", e.target.value)}
            onBlur={() => commit("vaultNote")}
            placeholder="Ideas/Nombre de la nota"
            className={`${input} font-mono text-xs`}
          />
        </Field>
      </div>

      <button
        onClick={async () => {
          if (!confirm("¿Borrar esta tarjeta?")) return;
          await api.deleteCard(card.id);
          onDeleted(card.id);
        }}
        className="flex items-center gap-2 text-xs text-faint hover:text-[#fb7185]"
      >
        <Trash2 size={14} /> Borrar tarjeta
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
  const [name, setName] = useState(project.name);
  return (
    <Shell title="Proyecto" onClose={onClose}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== project.name && onSave({ name: name.trim() })}
        className="w-full bg-transparent text-lg font-semibold text-fg outline-none"
      />
      <Field label="Área">
        <Select value={project.area} options={AREA} onChange={(area: AreaKey) => onSave({ area })} />
      </Field>
      <div className="space-y-2">
        <span className="text-[11px] text-faint">Color</span>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onSave({ color: c })}
              className={`h-7 w-7 rounded-full border-2 ${project.color === c ? "border-fg" : "border-transparent"}`}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>
      </div>
      <p className="font-mono text-xs text-faint">slug: {project.slug}</p>
      <button
        onClick={async () => {
          if (!confirm("¿Borrar el proyecto? Sus tarjetas pasan a Ideas sueltas.")) return;
          await track(api.deleteProject(project.id));
          onDeleted(project);
        }}
        className="flex items-center gap-2 text-xs text-faint hover:text-[#fb7185]"
      >
        <Trash2 size={14} /> Borrar proyecto
      </button>
    </Shell>
  );
}

export function KeysPanel({ onClose }: { onClose: () => void }) {
  const [keys, setKeys] = useState<ApiKeyDTO[] | null>(null);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  useEffect(() => {
    api.keys().then(({ keys }) => setKeys(keys)).catch(console.error);
  }, []);

  return (
    <Shell title="Claves para el CLI y los agentes" onClose={onClose}>
      <p className="text-sm text-muted">
        Cada clave actúa como tú sobre tu tablero. Úsala con el CLI <code className="font-mono text-cyan">park</code> o
        desde tus agentes.
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
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre: laptop, codex…" className={input} />
        <button className="shrink-0 rounded-lg bg-white px-3 text-sm font-medium text-ink hover:bg-zinc-200">Crear</button>
      </form>

      {secret && (
        <div className="space-y-2 rounded-xl border border-sun/40 bg-sun/5 p-4">
          <p className="text-xs text-sun">Cópiala ahora: no se vuelve a mostrar.</p>
          <pre className="overflow-x-auto rounded-lg bg-ink p-3 font-mono text-[11px] whitespace-pre-wrap text-fg">
            {`park config --url ${origin} --key ${secret}`}
          </pre>
          <button
            onClick={() => navigator.clipboard.writeText(`park config --url ${origin} --key ${secret}`)}
            className="text-xs text-cyan hover:underline"
          >
            Copiar comando
          </button>
        </div>
      )}

      <div className="space-y-2">
        {keys === null && <p className="text-xs text-faint">Cargando…</p>}
        {keys?.length === 0 && <p className="text-xs text-faint">Aún no tienes claves.</p>}
        {keys?.map((k) => (
          <div key={k.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-fg">{k.name}</p>
              <p className="font-mono text-[11px] text-faint">
                {k.prefix}… · {k.lastUsedAt ? `usada ${new Date(k.lastUsedAt).toLocaleDateString("es-CO")}` : "sin usar"}
              </p>
            </div>
            <button
              onClick={async () => {
                if (!confirm(`¿Revocar la clave «${k.name}»? Lo que la use dejará de funcionar.`)) return;
                await api.revokeKey(k.id);
                setKeys((ks) => ks?.filter((x) => x.id !== k.id) ?? null);
              }}
              className="text-xs text-faint hover:text-[#fb7185]"
            >
              Revocar
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
  const [q, setQ] = useState("");
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const done = cards
    .filter((c) => c.status === "DONE")
    .filter((c) => !q.trim() || `${c.title} ${c.notes}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (b.doneAt ?? b.updatedAt).localeCompare(a.doneAt ?? a.updatedAt));
  const groups = new Map<string, CardDTO[]>();
  for (const c of done) {
    const label = dayLabel(c.doneAt ?? c.updatedAt);
    groups.set(label, [...(groups.get(label) ?? []), c]);
  }

  return (
    <Shell title="Hechas" onClose={onClose}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en lo terminado" className={input} />
      {done.length === 0 && <p className="text-sm text-faint">Todavía no hay tareas terminadas.</p>}
      {[...groups].map(([label, items]) => (
        <section key={label} className="space-y-1.5">
          <h3 className="text-[11px] text-faint first-letter:uppercase">{label}</h3>
          {items.map((c) => {
            const span = c.doneAt ? ago(c.createdAt, new Date(c.doneAt).getTime()) : null;
            const took = span && span !== "ahora" ? span.replace("hace ", "") : null;
            return (
              <div key={c.id} className="group flex items-start gap-2 rounded-lg border border-line px-3 py-2 hover:bg-raised">
                <CircleCheck size={14} className="mt-0.5 shrink-0 text-[#4ade80]" />
                <button onClick={() => onOpen(c.id)} className="min-w-0 flex-1 text-left">
                  <p className="text-[13px] leading-snug text-fg">
                    <span className="font-mono text-faint">#{c.number}</span> {c.title}
                  </p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-faint">
                    {c.projectId ? names.get(c.projectId) : "Ideas sueltas"}
                    {took && ` · tomó ${took}`}
                  </p>
                </button>
                <button
                  onClick={() => onReopen(c)}
                  className="shrink-0 text-[11px] text-faint opacity-0 group-hover:opacity-100 hover:text-cyan"
                >
                  Reabrir
                </button>
              </div>
            );
          })}
        </section>
      ))}
    </Shell>
  );
}
