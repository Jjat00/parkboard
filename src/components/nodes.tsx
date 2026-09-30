"use client";

import { memo } from "react";
import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import { Bug, FlaskConical, Lightbulb, Link2, SquareCheck, StickyNote } from "lucide-react";
import { AREA, KIND, PRIORITY, STATUS, type KindKey } from "@/lib/labels";
import type { CardDTO, ProjectDTO } from "@/lib/types";

export type ProjectNode = Node<{ project: ProjectDTO; open: number; onResized: (id: string, w: number, h: number) => void }, "project">;
export type CardNode = Node<{ card: CardDTO }, "card">;

const KIND_ICON: Record<KindKey, typeof Bug> = {
  TASK: SquareCheck,
  IDEA: Lightbulb,
  BUG: Bug,
  RESEARCH: FlaskConical,
  NOTE: StickyNote,
};

export const ProjectGroup = memo(function ProjectGroup({ data, selected, width, height }: NodeProps<ProjectNode>) {
  const { project, open, onResized } = data;
  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={300}
        minHeight={200}
        lineStyle={{ borderColor: project.color }}
        handleStyle={{ background: project.color, width: 8, height: 8, border: 0 }}
        onResizeEnd={(_, p) => onResized(project.id, p.width, p.height)}
      />
      <div
        className="h-full w-full rounded-2xl border bg-panel/40"
        style={{ borderColor: `${project.color}55`, width, height }}
      >
        <div className="flex items-center gap-3 border-b px-5 py-3" style={{ borderColor: `${project.color}33` }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: project.color }} />
          <h2 className="text-sm font-semibold tracking-tight text-fg">{project.name}</h2>
          <span className="font-mono text-[11px] text-faint">{AREA[project.area]}</span>
          <span className="ml-auto font-mono text-[11px] text-faint">{open} abiertas</span>
        </div>
      </div>
    </>
  );
});

export const CardItem = memo(function CardItem({ data, selected }: NodeProps<CardNode>) {
  const { card } = data;
  const Icon = KIND_ICON[card.kind];
  const priority = PRIORITY[card.priority];
  const done = card.status === "DONE";
  return (
    <div
      className={`relative h-[150px] w-[260px] overflow-hidden rounded-xl border bg-panel px-4 py-3 transition-colors hover:bg-raised ${
        selected ? "border-cyan" : "border-line"
      } ${done ? "opacity-50" : ""}`}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: priority.color }} />
      <div className="flex items-center gap-2 text-[11px] text-faint">
        <Icon size={13} />
        <span>{KIND[card.kind]}</span>
        <span className="ml-auto rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-muted">
          {STATUS[card.status]}
        </span>
      </div>
      <p className={`mt-2 line-clamp-3 text-[13px] leading-snug font-medium text-fg ${done ? "line-through" : ""}`}>
        {card.title}
      </p>
      <div className="absolute inset-x-4 bottom-3 flex items-center gap-2 text-[10px] text-faint">
        {card.tags.slice(0, 2).map((t) => (
          <span key={t} className="rounded bg-white/5 px-1.5 py-0.5 font-mono">
            #{t}
          </span>
        ))}
        {card.links.length > 0 && (
          <span className="flex items-center gap-0.5">
            <Link2 size={11} />
            {card.links.length}
          </span>
        )}
        <span className="ml-auto truncate font-mono">{card.origin}</span>
      </div>
    </div>
  );
});

export const nodeTypes = { project: ProjectGroup, card: CardItem };
