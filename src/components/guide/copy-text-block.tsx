"use client";

import { useState } from "react";
import { Check, Clipboard } from "lucide-react";

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function CopyTextBlock({
  title,
  text,
  label,
  compact = false,
}: {
  title: string;
  text: string;
  label?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3">
        <div>
          {label ? <p className="text-xs font-semibold text-red-700">{label}</p> : null}
          <h3 className={label ? "mt-1 text-base font-semibold text-slate-950" : "text-sm font-semibold text-slate-950"}>
            {title}
          </h3>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          aria-label={copied ? "已复制" : "复制内容"}
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />}
          <span aria-live="polite">{copied ? "已复制" : "复制"}</span>
        </button>
      </div>
      <pre
        className={[
          "whitespace-pre-wrap px-4 py-4 font-sans text-sm leading-7 text-slate-700",
          compact ? "max-h-[360px] overflow-auto" : "",
        ].join(" ")}
      >
        {text}
      </pre>
    </div>
  );
}
