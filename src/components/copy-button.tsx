"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="shrink-0 rounded-md p-1.5 text-faint transition-colors hover:bg-raised hover:text-fg"
    >
      {copied ? <Check size={14} className="text-cyan" /> : <Copy size={14} />}
    </button>
  );
}
