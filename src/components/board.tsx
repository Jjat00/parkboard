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
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { UserButton } from "@clerk/nextjs";
import { FolderPlus, KeyRound, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { AREA, type AreaKey } from "@/lib/labels";
import type { CardDTO, ProjectDTO } from "@/lib/types";
import { nodeTypes, type CardNode, type ProjectNode } from "./nodes";
import { CardPanel, KeysPanel, ProjectPanel } from "./panels";

type BoardData = { projects: ProjectDTO[]; cards: CardDTO[] };
type Filters = { area: AreaKey | "ALL"; showDone: boolean; q: string };

const CARD_W = 260;
const CARD_H = 150;
const REFRESH_MS = 20_000;

function cardArea(card: CardDTO, projects: Map<string, ProjectDTO>) {
  return card.projectId ? (projects.get(card.projectId)?.area ?? card.area) : card.area;
}

function buildNodes(
  { projects, cards }: BoardData,
  filters: Filters,
  selected: Set<string>,
  onResized: ProjectNode["data"]["onResized"],
): Node[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const q = filters.q.trim().toLowerCase();
  const visibleCard = (c: CardDTO) =>
    (filters.showDone || c.status !== "DONE") &&
    (filters.area === "ALL" || cardArea(c, byId) === filters.area) &&
    (!q || `${c.title} ${c.notes} ${c.tags.join(" ")}`.toLowerCase().includes(q));

  const projectNodes: ProjectNode[] = projects.map((p) => ({
    id: p.id,
    type: "project",
    position: { x: p.x, y: p.y },
    width: p.width,
    height: p.height,
    zIndex: 0,
    selected: selected.has(p.id),
    hidden: filters.area !== "ALL" && p.area !== filters.area,
    dragHandle: undefined,
    data: { project: p, open: cards.filter((c) => c.projectId === p.id && c.status !== "DONE").length, onResized },
  }));
  const cardNodes: CardNode[] = cards.map((c) => ({
    id: c.id,
    type: "card",
    position: { x: c.x, y: c.y },
    parentId: c.projectId ?? undefined,
    width: CARD_W,
    height: CARD_H,
    zIndex: 10,
    selected: selected.has(c.id),
    hidden: !visibleCard(c),
    data: { card: c },
  }));
  // Parents must come before their children.
  return [...projectNodes, ...cardNodes];
}

function Canvas({ initial }: { initial: BoardData }) {
  const [data, setData] = useState<BoardData>(initial);
  const [filters, setFilters] = useState<Filters>({ area: "ALL", showDone: false, q: "" });
  const [selection, setSelection] = useState<{ kind: "card" | "project"; id: string } | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [showKeys, setShowKeys] = useState(false);
  const dragging = useRef(false);
  const { getInternalNode, screenToFlowPosition, setCenter } = useReactFlow();

  const patchProject = useCallback((id: string, patch: Partial<ProjectDTO>) => {
    setData((d) => ({ ...d, projects: d.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
    api.updateProject(id, patch).catch(console.error);
  }, []);

  const onResized = useCallback(
    (id: string, width: number, height: number) => patchProject(id, { width, height }),
    [patchProject],
  );

  const selectedIds = useMemo(() => new Set(selection ? [selection.id] : []), [selection]);

  useEffect(() => {
    setNodes(buildNodes(data, filters, selectedIds, onResized));
  }, [data, filters, selectedIds, onResized, setNodes]);

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
      const cy = abs.y + CARD_H / 2;
      const target = [...data.projects]
        .reverse()
        .find(
          (p) =>
            (filters.area === "ALL" || p.area === filters.area) &&
            cx >= p.x && cx <= p.x + p.width && cy >= p.y && cy <= p.y + p.height,
        );
      const targetId = target?.id ?? null;
      if (targetId === card.projectId) {
        upsertCard({ ...card, x: node.position.x, y: node.position.y });
        api.updateCard(card.id, { x: node.position.x, y: node.position.y }).catch(console.error);
        return;
      }
      const x = target ? abs.x - target.x : abs.x;
      const y = target ? abs.y - target.y : abs.y;
      upsertCard({ ...card, projectId: targetId, x, y });
      if (target && y + CARD_H + 20 > target.height) patchProject(target.id, { height: y + CARD_H + 20 });
      api.updateCard(card.id, { project: targetId, x, y }).then(({ card: saved }) => upsertCard(saved)).catch(console.error);
    },
    [data, filters.area, getInternalNode, patchProject, upsertCard],
  );

  const onSelectionChange = useCallback(({ nodes: sel }: OnSelectionChangeParams) => {
    const n = sel[0];
    setSelection(n ? { kind: n.type === "project" ? "project" : "card", id: n.id } : null);
  }, []);

  const addCard = useCallback(
    async (title: string, projectId: string | null) => {
      const area = filters.area === "ALL" ? undefined : filters.area;
      const { card } = await api.createCard({ title, project: projectId, area, origin: "web" });
      upsertCard(card);
      if (projectId) setData(await api.board());
      setSelection({ kind: "card", id: card.id });
    },
    [filters.area, upsertCard],
  );

  const addProject = useCallback(
    async (name: string) => {
      const center = screenToFlowPosition({ x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 150 });
      const area = filters.area === "ALL" ? "PERSONAL" : filters.area;
      const { project } = await api.createProject({ name, area, x: center.x, y: center.y });
      setData((d) => ({ ...d, projects: [...d.projects, project] }));
      setSelection({ kind: "project", id: project.id });
    },
    [filters.area, screenToFlowPosition],
  );

  const focusProject = useCallback(
    (p: ProjectDTO) => setCenter(p.x + p.width / 2, p.y + p.height / 2, { zoom: 0.9, duration: 400 }),
    [setCenter],
  );

  const selectedCard = selection?.kind === "card" ? data.cards.find((c) => c.id === selection.id) : undefined;
  const selectedProject =
    selection?.kind === "project" ? data.projects.find((p) => p.id === selection.id) : undefined;

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        data={data}
        filters={filters}
        setFilters={setFilters}
        onAddCard={addCard}
        onAddProject={addProject}
        onFocusProject={focusProject}
        onOpenKeys={() => {
          setSelection(null);
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
          onSelectionChange={onSelectionChange}
          onPaneClick={() => setSelection(null)}
          fitView
          minZoom={0.1}
          maxZoom={2}
          colorMode="dark"
          proOptions={{ hideAttribution: false }}
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
  onOpenKeys,
}: {
  data: BoardData;
  filters: Filters;
  setFilters: (f: Filters) => void;
  onAddCard: (title: string, projectId: string | null) => Promise<void>;
  onAddProject: (name: string) => Promise<void>;
  onFocusProject: (p: ProjectDTO) => void;
  onOpenKeys: () => void;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [newProject, setNewProject] = useState<string | null>(null);
  const open = data.cards.filter((c) => c.status !== "DONE").length;

  return (
    <header className="z-10 flex flex-wrap items-center gap-3 border-b border-line bg-ink/90 px-4 py-3 backdrop-blur">
      <div className="flex items-baseline gap-2 pr-2">
        <span className="text-gradient text-lg font-semibold tracking-tight">Parkboard</span>
        <span className="font-mono text-[11px] text-faint">{open} abiertas</span>
      </div>

      <form
        className="flex min-w-[280px] flex-1 items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 focus-within:border-cyan/60"
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
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="max-w-[160px] bg-transparent text-xs text-muted outline-none"
        >
          <option value="">Bandeja</option>
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

      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={filters.showDone}
          onChange={(e) => setFilters({ ...filters, showDone: e.target.checked })}
          className="accent-[#68ddfd]"
        />
        Hechas
      </label>

      <select
        value=""
        onChange={(e) => {
          const p = data.projects.find((x) => x.id === e.target.value);
          if (p) onFocusProject(p);
        }}
        className="rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-muted outline-none"
      >
        <option value="">Ir a proyecto…</option>
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
        onClick={onOpenKeys}
        className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:bg-raised hover:text-fg"
      >
        <KeyRound size={14} /> CLI
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
