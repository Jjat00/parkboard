"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { UserButton } from "@clerk/nextjs";
import { ArrowDownUp, CircleCheck, ChevronsDownUp, ChevronsUpDown, FolderPlus, KeyRound, LayoutGrid, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { AREA, type AreaKey } from "@/lib/labels";
import { arrangeProjects, CARD_W, INBOX_ID, layoutProject, resolveOverlaps, SORT_MODES, type SortMode } from "@/lib/layout";
import type { CardDTO, ProjectDTO } from "@/lib/types";
import { nodeTypes, type CardNode, type ProjectNode } from "./nodes";
import { CardPanel, DonePanel, KeysPanel, ProjectPanel } from "./panels";

type BoardData = { projects: ProjectDTO[]; cards: CardDTO[] };
type Filters = { area: AreaKey | "ALL"; q: string; sort: SortMode };
type Rect = { x: number; y: number; width: number; height: number };

const REFRESH_MS = 20_000;
const EXPANDED_KEY = "parkboard.expanded";
const SORT_KEY = "parkboard.sort";

function cardArea(card: CardDTO, projects: Map<string, ProjectDTO>) {
  return card.projectId ? (projects.get(card.projectId)?.area ?? card.area) : card.area;
}

function loadExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function loadSort(): SortMode | null {
  try {
    const sort = localStorage.getItem(SORT_KEY);
    return sort && sort in SORT_MODES ? (sort as SortMode) : null;
  } catch {
    return null;
  }
}

/** Positions and sizes for everything on the canvas. Projects fit their visible cards. */
function useLayout({ projects, cards }: BoardData, filters: Filters, expanded: Set<string>) {
  return useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p]));
    const q = filters.q.trim().toLowerCase();
    const visible = cards.filter(
      (c) =>
        c.status !== "DONE" &&
        (filters.area === "ALL" || cardArea(c, byId) === filters.area) &&
        (!q || `#${c.number} ${c.title} ${c.notes} ${c.tags.join(" ")}`.toLowerCase().includes(q) || q === String(c.number)),
    );
    const shownProjects = projects.filter((p) => filters.area === "ALL" || p.area === filters.area);
    const isExpanded = (id: string) => expanded.has(id);
    const layouts = new Map(
      shownProjects.map((p) => [p.id, layoutProject(visible.filter((c) => c.projectId === p.id), isExpanded, filters.sort)]),
    );
    const positions = resolveOverlaps(shownProjects, layouts);
    const rects = new Map<string, Rect>(
      shownProjects.map((p) => [p.id, { ...positions.get(p.id)!, width: layouts.get(p.id)!.width, height: layouts.get(p.id)!.height }]),
    );
    // Cards without project live in the "Ideas sueltas" group, left of the projects.
    const loose = visible.filter((c) => !c.projectId);
    const showInbox = filters.area === "ALL" || loose.length > 0;
    if (showInbox) {
      const inbox = layoutProject(loose, isExpanded, filters.sort);
      layouts.set(INBOX_ID, inbox);
      const xs = [...rects.values()];
      rects.set(INBOX_ID, {
        x: (xs.length ? Math.min(...xs.map((r) => r.x)) : 0) - inbox.width - 80,
        y: xs.length ? Math.min(...xs.map((r) => r.y)) : 0,
        width: inbox.width,
        height: inbox.height,
      });
    }
    return { visible, shownProjects, layouts, rects, isExpanded, showInbox };
  }, [projects, cards, filters, expanded]);
}

function Canvas({ initial }: { initial: BoardData }) {
  const [data, setData] = useState<BoardData>(initial);
  const [filters, setFilters] = useState<Filters>({ area: "ALL", q: "", sort: "auto" });
  const [showDone, setShowDone] = useState(false);
  const [selection, setSelection] = useState<{ kind: "card" | "project"; id: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [showKeys, setShowKeys] = useState(false);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const dragging = useRef(false);
  const { fitView, getInternalNode, screenToFlowPosition, setCenter } = useReactFlow();

  // Read after mount: localStorage does not exist on the server, and a lazy initial state would
  // make the server and client render different toolbars.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setExpanded(loadExpanded());
    const sort = loadSort();
    if (sort) setFilters((f) => ({ ...f, sort }));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const changeFilters = useCallback((f: Filters) => {
    setFilters(f);
    try {
      localStorage.setItem(SORT_KEY, f.sort);
    } catch {
      /* storage blocked */
    }
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      } catch {
        /* storage blocked */
      }
      return next;
    });
  }, []);

  const layout = useLayout(data, filters, expanded);

  const setAllExpanded = useCallback(
    (open: boolean) => {
      const next = open ? new Set(layout.visible.map((c) => c.id)) : new Set<string>();
      setExpanded(next);
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      } catch {
        /* storage blocked */
      }
    },
    [layout.visible],
  );

  useEffect(() => {
    const { visible, shownProjects, layouts, rects, isExpanded, showInbox } = layout;
    const selectedId = selection?.id;
    const projectNodes: ProjectNode[] = shownProjects.map((p) => {
      const r = rects.get(p.id)!;
      return {
        id: p.id,
        type: "project",
        position: { x: r.x, y: r.y },
        width: r.width,
        height: r.height,
        zIndex: 0,
        selected: selectedId === p.id,
        data: {
          project: p,
          open: data.cards.filter((c) => c.projectId === p.id && c.status !== "DONE").length,
          empty: layouts.get(p.id)!.cards.size === 0,
        },
      };
    });
    if (showInbox) {
      const r = rects.get(INBOX_ID)!;
      projectNodes.unshift({
        id: INBOX_ID,
        type: "project",
        position: { x: r.x, y: r.y },
        width: r.width,
        height: r.height,
        zIndex: 0,
        draggable: false,
        selectable: false,
        data: {
          project: { id: INBOX_ID, slug: "", name: "Ideas sueltas", area: null, color: "#a1a09a", x: r.x, y: r.y, width: r.width, height: r.height, createdAt: "" },
          open: data.cards.filter((c) => !c.projectId && c.status !== "DONE").length,
          empty: layouts.get(INBOX_ID)!.cards.size === 0,
          inbox: true,
        },
      });
    }
    const cardNodes: CardNode[] = visible
      .filter((c) => rects.has(c.projectId ?? INBOX_ID))
      .map((c) => {
        const group = c.projectId ?? INBOX_ID;
        const slot = layouts.get(group)!.cards.get(c.id)!;
        const height = slot.h;
        return {
          id: c.id,
          type: "card",
          position: { x: slot.x, y: slot.y },
          parentId: group,
          width: CARD_W,
          height,
          zIndex: 10,
          selected: selectedId === c.id,
          data: { card: c, expanded: isExpanded(c.id), height, onToggle: toggleExpanded, sort: filters.sort },
        };
      });
    // Parents must come before their children.
    setNodes([...projectNodes, ...cardNodes]);
  }, [layout, data.cards, selection, toggleExpanded, setNodes, layoutVersion, filters.sort]);

  const refresh = useCallback(async () => {
    if (dragging.current || document.visibilityState !== "visible") return;
    try {
      setData(await api.board());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    const t = setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const upsertCard = useCallback((card: CardDTO) => {
    setData((d) => {
      const exists = d.cards.some((c) => c.id === card.id);
      return { ...d, cards: exists ? d.cards.map((c) => (c.id === card.id ? card : c)) : [...d.cards, card] };
    });
  }, []);

  const patchProject = useCallback((id: string, patch: Partial<ProjectDTO>) => {
    setData((d) => ({ ...d, projects: d.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
    api.updateProject(id, patch).catch(console.error);
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      dragging.current = false;
      if (node.type === "project") {
        patchProject(node.id, { x: node.position.x, y: node.position.y });
        return;
      }
      const card = data.cards.find((c) => c.id === node.id);
      const abs = getInternalNode(node.id)?.internals.positionAbsolute;
      if (!card || !abs) return;
      const cx = abs.x + CARD_W / 2;
      const cy = abs.y + (node.height ?? 64) / 2;
      let hit: string | null = null;
      for (const [id, r] of layout.rects) {
        if (cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height) hit = id;
      }
      const targetId = hit === INBOX_ID ? null : hit;
      // Dropped on empty canvas or back on its own group: the order is automatic, snap back.
      if (!hit || targetId === card.projectId) {
        setLayoutVersion((v) => v + 1);
        return;
      }
      upsertCard({ ...card, projectId: targetId });
      api
        .updateCard(card.id, { project: targetId })
        .then(({ card: saved }) => upsertCard(saved))
        .catch(console.error);
    },
    [data.cards, layout.rects, getInternalNode, patchProject, upsertCard],
  );

  const arrange = useCallback(() => {
    const positions = arrangeProjects(layout.shownProjects, layout.layouts);
    setData((d) => ({ ...d, projects: d.projects.map((p) => ({ ...p, ...positions.get(p.id) })) }));
    Promise.all([...positions].map(([id, pos]) => api.updateProject(id, pos))).catch(console.error);
    setTimeout(() => fitView({ duration: 400, maxZoom: 1 }), 50);
  }, [layout.shownProjects, layout.layouts, fitView]);

  const addCard = useCallback(
    async (title: string, projectId: string | null) => {
      const area = filters.area === "ALL" ? undefined : filters.area;
      const { card } = await api.createCard({ title, project: projectId, area, origin: "web" });
      upsertCard(card);
      setSelection({ kind: "card", id: card.id });
    },
    [filters.area, upsertCard],
  );

  const addProject = useCallback(
    async (name: string) => {
      const center = screenToFlowPosition({ x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 - 60 });
      const area = filters.area === "ALL" ? "PERSONAL" : filters.area;
      const { project } = await api.createProject({ name, area, x: center.x, y: center.y });
      setData((d) => ({ ...d, projects: [...d.projects, project] }));
      setSelection({ kind: "project", id: project.id });
    },
    [filters.area, screenToFlowPosition],
  );

  const focusProject = useCallback(
    (p: ProjectDTO) => {
      const r = layout.rects.get(p.id);
      if (r) setCenter(r.x + r.width / 2, r.y + r.height / 2, { zoom: 1, duration: 400 });
    },
    [layout.rects, setCenter],
  );

  const selectedCard = selection?.kind === "card" ? data.cards.find((c) => c.id === selection.id) : undefined;
  const selectedProject =
    selection?.kind === "project" ? data.projects.find((p) => p.id === selection.id) : undefined;

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        data={data}
        filters={filters}
        setFilters={changeFilters}
        doneCount={data.cards.filter((c) => c.status === "DONE").length}
        onOpenDone={() => {
          setSelection(null);
          setShowKeys(false);
          setShowDone(true);
        }}
        onAddCard={addCard}
        onAddProject={addProject}
        onFocusProject={focusProject}
        anyExpanded={layout.visible.some((c) => expanded.has(c.id))}
        onSetAllExpanded={setAllExpanded}
        onArrange={arrange}
        onOpenKeys={() => {
          setSelection(null);
          setShowDone(false);
          setShowKeys(true);
        }}
      />
      <div className="relative flex-1">
        <ReactFlow
          nodes={nodes}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          onNodeDragStart={() => (dragging.current = true)}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_, n) => {
            if (n.id !== INBOX_ID) setSelection({ kind: n.type === "project" ? "project" : "card", id: n.id });
          }}
          onPaneClick={() => setSelection(null)}
          fitView
          fitViewOptions={{ maxZoom: 1 }}
          minZoom={0.1}
          maxZoom={2}
          colorMode="dark"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} />
          <Controls position="bottom-left" />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={(n) => (n.type === "project" ? `${(n.data as ProjectNode["data"]).project.color}33` : "#232323")}
          />
        </ReactFlow>
        {showKeys && !selection && <KeysPanel onClose={() => setShowKeys(false)} />}
        {showDone && !selection && (
          <DonePanel
            cards={data.cards}
            projects={data.projects}
            onOpen={(id) => setSelection({ kind: "card", id })}
            onReopen={(card) => {
              upsertCard({ ...card, status: "PENDING", doneAt: null });
              api.updateCard(card.id, { status: "PENDING" }).then(({ card: saved }) => upsertCard(saved)).catch(console.error);
            }}
            onClose={() => setShowDone(false)}
          />
        )}
        {selectedCard && (
          <CardPanel
            key={selectedCard.id}
            card={selectedCard}
            projects={data.projects}
            onSaved={upsertCard}
            onDeleted={(id) => {
              setData((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== id) }));
              setSelection(null);
            }}
            onClose={() => setSelection(null)}
          />
        )}
        {selectedProject && (
          <ProjectPanel
            key={selectedProject.id}
            project={selectedProject}
            onSave={(patch) => patchProject(selectedProject.id, patch)}
            onDeleted={async () => {
              setSelection(null);
              setData(await api.board());
            }}
            onClose={() => setSelection(null)}
          />
        )}
      </div>
    </div>
  );
}

function Toolbar({
  data,
  filters,
  setFilters,
  onAddCard,
  onAddProject,
  onFocusProject,
  anyExpanded,
  onSetAllExpanded,
  onArrange,
  onOpenKeys,
  doneCount,
  onOpenDone,
}: {
  data: BoardData;
  filters: Filters;
  setFilters: (f: Filters) => void;
  onAddCard: (title: string, projectId: string | null) => Promise<void>;
  onAddProject: (name: string) => Promise<void>;
  onFocusProject: (p: ProjectDTO) => void;
  anyExpanded: boolean;
  onSetAllExpanded: (open: boolean) => void;
  onArrange: () => void;
  doneCount: number;
  onOpenDone: () => void;
  onOpenKeys: () => void;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [newProject, setNewProject] = useState<string | null>(null);
  const open = data.cards.filter((c) => c.status !== "DONE").length;

  return (
    <header className="z-10 flex flex-wrap items-center gap-2 border-b border-line bg-ink/90 px-4 py-3 backdrop-blur">
      <div className="flex items-baseline gap-2 pr-2">
        <span className="text-gradient text-lg font-semibold tracking-tight">Parkboard</span>
        <span className="font-mono text-[11px] text-faint">{open} abiertas</span>
      </div>

      <form
        className="flex min-w-[220px] flex-1 items-center overflow-hidden gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 focus-within:border-cyan/60"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          await onAddCard(title.trim(), projectId || null);
          setTitle("");
        }}
      >
        <Plus size={15} className="text-faint" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Parquear algo para después…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-[104px] shrink-0 truncate bg-transparent text-xs text-muted outline-none"
        >
          <option value="">Ideas sueltas</option>
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </form>

      <div className="flex items-center rounded-lg border border-line p-0.5 text-xs">
        {(["ALL", "PERSONAL", "WORK"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setFilters({ ...filters, area: a })}
            className={`rounded-md px-3 py-1 ${filters.area === a ? "bg-white/10 text-fg" : "text-muted hover:text-fg"}`}
          >
            {a === "ALL" ? "Todo" : AREA[a]}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs text-muted">
        <Search size={13} />
        <input
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          placeholder="Filtrar"
          className="w-28 bg-transparent outline-none placeholder:text-faint"
        />
      </label>

      <label className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-muted" title="Orden de las tareas">
        <ArrowDownUp size={13} />
        <select
          value={filters.sort}
          onChange={(e) => setFilters({ ...filters, sort: e.target.value as SortMode })}
          className="bg-transparent outline-none"
        >
          {(Object.keys(SORT_MODES) as SortMode[]).map((m) => (
            <option key={m} value={m}>
              {SORT_MODES[m]}
            </option>
          ))}
        </select>
      </label>

      <button
        onClick={onOpenDone}
        className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:bg-raised hover:text-fg"
        title="Tareas terminadas"
      >
        <CircleCheck size={14} /> Hechas <span className="font-mono text-faint">{doneCount}</span>
      </button>

      <select
        value=""
        onChange={(e) => {
          const p = data.projects.find((x) => x.id === e.target.value);
          if (p) onFocusProject(p);
        }}
        className="rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-muted outline-none"
      >
        <option value="">Ir a…</option>
        {data.projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {newProject === null ? (
        <button
          onClick={() => setNewProject("")}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:bg-raised hover:text-fg"
        >
          <FolderPlus size={14} /> Proyecto
        </button>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (newProject.trim()) await onAddProject(newProject.trim());
            setNewProject(null);
          }}
        >
          <input
            autoFocus
            value={newProject}
            onChange={(e) => setNewProject(e.target.value)}
            onBlur={() => !newProject.trim() && setNewProject(null)}
            placeholder="Nombre del proyecto"
            className="w-44 rounded-lg border border-cyan/60 bg-panel px-3 py-1.5 text-xs outline-none"
          />
        </form>
      )}

      <button
        onClick={onArrange}
        className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:bg-raised hover:text-fg"
        title="Acomodar: ordena los proyectos en columnas, trabajo primero"
        aria-label="Acomodar proyectos"
      >
        <LayoutGrid size={14} />
      </button>

      <button
        onClick={() => onSetAllExpanded(!anyExpanded)}
        className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:bg-raised hover:text-fg"
        title={anyExpanded ? "Compactar todas" : "Expandir todas"}
        aria-label={anyExpanded ? "Compactar todas" : "Expandir todas"}
      >
        {anyExpanded ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
      </button>

      <button
        onClick={onOpenKeys}
        title="Claves para el CLI y los agentes"
        aria-label="Claves para el CLI"
        className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:bg-raised hover:text-fg"
      >
        <KeyRound size={14} />
      </button>

      <UserButton />
    </header>
  );
}

export function Board({ initial }: { initial: BoardData }) {
  return (
    <ReactFlowProvider>
      <Canvas initial={initial} />
    </ReactFlowProvider>
  );
}
