"use client";

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { Bot, Bug, ChevronDown, ChevronUp, FlaskConical, Lightbulb, Link2, SquareCheck, StickyNote } from "lucide-react";
import { AREA, KIND, PRIORITY, STATUS, type KindKey, type StatusKey } from "@/lib/labels";
import { CARD_W } from "@/lib/layout";
import { AGENT_LABEL } from "@/lib/session";
import type { CardDTO, ProjectDTO } from "@/lib/types";

export type ProjectNode = Node<
  { project: Omit<ProjectDTO, "area"> & { area: ProjectDTO["area"] | null }; open: number; empty: boolean; inbox?: boolean },
  "project"
>;
export type CardNode = Node<{ card: CardDTO; expanded: boolean; height: number; onToggle: (id: string) => void }, "card">;

const KIND_ICON: Record<KindKey, typeof Bug> = {
  TASK: SquareCheck,
  IDEA: Lightbulb,
  BUG: Bug,
  RESEARCH: FlaskConical,
  NOTE: StickyNote,
};

const STATUS_DOT: Record<StatusKey, string> = {
  IDEA: "#9e8cfc",
  PENDING: "#a1a09a",
  DOING: "#68ddfd",
  DONE: "#4ade80",
};

export const ProjectGroup = memo(function ProjectGroup({ data, width, height }: NodeProps<ProjectNode>) {
  const { project, open, empty, inbox } = data;
  return (
    <div
      className={`rounded-2xl border ${inbox ? "border-dashed bg-transparent" : "bg-panel/40"}`}
      style={{ borderColor: `${project.color}55`, width, height }}
    >
      <div className="flex h-[46px] items-center gap-2.5 px-4" style={{ borderBottom: `1px solid ${project.color}26` }}>
        {inbox ? (
          <Lightbulb size={13} className="shrink-0 text-muted" />
        ) : (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: project.color }} />
        )}
        <h2 className="truncate text-[13px] font-semibold tracking-tight text-fg">{project.name}</h2>
        {project.area && <span className="font-mono text-[10px] text-faint">{AREA[project.area]}</span>}
        <span className="ml-auto shrink-0 font-mono text-[10px] text-faint">{open}</span>
      </div>
      {empty && (
        <p className="px-4 py-3 text-xs text-faint">{inbox ? "Suelta aquí ideas sin proyecto" : "Sin tareas visibles"}</p>
      )}
    </div>
  );
});

export const CardItem = memo(function CardItem({ data, selected }: NodeProps<CardNode>) {
  const { card, expanded, height, onToggle } = data;
  const Icon = KIND_ICON[card.kind];
  const done = card.status === "DONE";
  const urgent = card.priority === "HIGH" || card.priority === "URGENT";
  const Toggle = expanded ? ChevronUp : ChevronDown;

  return (
    <div
      className={`group flex flex-col overflow-hidden rounded-lg border bg-panel px-3 py-2.5 transition-colors hover:border-white/15 hover:bg-raised ${
        selected ? "border-white/25" : "border-line"
      } ${done ? "opacity-50" : ""}`}
      style={{ width: CARD_W, height }}
      title="Clic para ver detalles"
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: STATUS_DOT[card.status] }}
          title={STATUS[card.status]}
        />
        <p
          className={`flex-1 text-[12.5px] leading-snug font-medium text-fg ${expanded ? "line-clamp-3" : "line-clamp-2"} ${
            done ? "line-through" : ""
          }`}
        >
          {card.title}
        </p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(card.id);
          }}
          className="nodrag -mt-0.5 -mr-1 shrink-0 rounded p-0.5 text-faint opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-fg"
          aria-label={expanded ? "Compactar" : "Expandir"}
        >
          <Toggle size={14} />
        </button>
      </div>

      {expanded && (
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2 border-t border-line pt-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-faint">
            <span className="flex items-center gap-1">
              <Icon size={11} /> {KIND[card.kind]}
            </span>
            <span>· {STATUS[card.status]}</span>
            <span style={{ color: urgent ? PRIORITY[card.priority].color : undefined }}>
              · {PRIORITY[card.priority].label}
            </span>
          </div>
          {card.notes && <p className="line-clamp-3 text-[11px] leading-relaxed text-muted">{card.notes}</p>}
          <div className="mt-auto flex items-center gap-1.5 text-[10px] text-faint">
            {card.tags.slice(0, 2).map((t) => (
              <span key={t} className="rounded bg-white/5 px-1.5 py-0.5 font-mono">
                #{t}
              </span>
            ))}
            {card.links.length > 0 && (
              <span className="flex items-center gap-0.5">
                <Link2 size={10} />
                {card.links.length}
              </span>
            )}
            {card.agent && (
              <span className="ml-auto flex items-center gap-1 font-mono">
                <Bot size={10} />
                {AGENT_LABEL[card.agent] ?? card.agent}
              </span>
            )}
          </div>
        </div>
      )}

      {!expanded && (
        <div className="mt-auto flex items-center gap-1.5 pl-3.5 text-[10px] text-faint">
          <Icon size={10} />
          <span>{KIND[card.kind]}</span>
          {urgent && <span style={{ color: PRIORITY[card.priority].color }}>· {PRIORITY[card.priority].label}</span>}
          {card.agent && <span className="ml-auto font-mono">{AGENT_LABEL[card.agent] ?? card.agent}</span>}
        </div>
      )}
    </div>
  );
});

export const nodeTypes = { project: ProjectGroup, card: CardItem };
