"use client";

import { useState } from "react";

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure contexts: fall back to a hidden textarea.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

/** Copies a caption so it can be pasted straight into Instagram / a group chat. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    const ok = await writeClipboard(text);
    setState(ok ? "copied" : "failed");
    window.setTimeout(() => setState("idle"), 1800);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-full px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-paper hover:text-ink"
      aria-label={`${label} caption`}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
    </button>
  );
}

/**
 * Share a post. Uses the phone's share sheet when there is one, otherwise
 * copies the link.
 */
export function ShareButton({
  url,
  title,
  text,
  className = "",
  children = "Share",
}: {
  url: string;
  title: string;
  text: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [note, setNote] = useState<string | null>(null);

  async function share() {
    const absolute = new URL(url, window.location.origin).toString();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url: absolute });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    const ok = await writeClipboard(absolute);
    setNote(ok ? "Link copied" : "Copy failed");
    window.setTimeout(() => setNote(null), 2000);
  }

  return (
    <button type="button" onClick={share} className={className}>
      {note ?? children}
    </button>
  );
}
