"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MUTE_KEY = "captioned-nyc-announcements";

export function isMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "off";
  } catch {
    return false;
  }
}

function setMuted(off: boolean) {
  try {
    if (off) window.localStorage.setItem(MUTE_KEY, "off");
    else window.localStorage.removeItem(MUTE_KEY);
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

/** The two falling notes a train plays before the doors close, made with the Web Audio API (no audio file). */
export function chime(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return resolve();
      const ctx = new Ctx();
      const now = ctx.currentTime;
      [659.25, 523.25].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const start = now + i * 0.32;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.5);
      });
      window.setTimeout(() => {
        void ctx.close().catch(() => {});
        resolve();
      }, 850);
    } catch {
      resolve();
    }
  });
}

/**
 * Plays a subway-style announcement: a door chime, then the text read by the
 * browser's own voice (Web Speech API). Nothing is downloaded and no real MTA
 * recording is used. With `auto`, it tries once when it appears (browsers may
 * block sound that the visitor didn't ask for; the button still works).
 * Stopping it is remembered, so it won't start by itself again.
 */
export default function AnnounceButton({
  text,
  auto = false,
  label = "Hear the announcement",
  className = "",
}: {
  text: string;
  auto?: boolean;
  label?: string;
  className?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [playing, setPlaying] = useState(false);
  const run = useRef(0);

  const stop = useCallback(() => {
    run.current++;
    window.speechSynthesis?.cancel();
    setPlaying(false);
  }, []);

  const play = useCallback(async () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const mine = ++run.current;
    synth.cancel();
    setPlaying(true);
    await chime();
    if (run.current !== mine) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.92;
    u.pitch = 0.9;
    const voice = synth.getVoices().find((v) => v.lang === "en-US" && v.localService) ?? synth.getVoices().find((v) => v.lang.startsWith("en"));
    if (voice) u.voice = voice;
    const done = () => {
      if (run.current === mine) setPlaying(false);
    };
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
  }, [text]);

  useEffect(() => {
    const ok = typeof window !== "undefined" && "speechSynthesis" in window;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only capability, unknown on the server
    setSupported(ok);
    if (ok && auto && !isMuted()) void play();
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- a counter, not a DOM node: bumping it cancels a pending announcement
      run.current++;
      window.speechSynthesis?.cancel();
    };
  }, [auto, play]);

  if (!supported) return null;

  return (
    <button
      type="button"
      aria-pressed={playing}
      onClick={() => {
        if (playing) {
          setMuted(true);
          stop();
        } else {
          setMuted(false);
          void play();
        }
      }}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4z" />
        {playing ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
      </svg>
      {playing ? "Stop" : label}
    </button>
  );
}
