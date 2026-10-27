"use client";

import SubwayMap from "../SubwayMap";
import type { LiveRider } from "./scene";

/**
 * What the live map shows when 3D can't run (no WebGL, lost GPU context, or a
 * crash inside the scene): the same overlay, with the simple 2D line in it.
 */
export default function Fallback2D({ riders, onClose }: { riders: LiveRider[]; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-auto bg-paper text-ink" role="dialog" aria-modal="true" aria-label="Race to Columbia map">
      <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-2.5 rounded-full bg-sign py-1.5 pl-1.5 pr-4 text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bullet-red text-[15px] font-bold">1</span>
          <span className="text-sm font-bold sm:text-[15px]">Race to Columbia</span>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close map" className="flex h-11 w-11 items-center justify-center rounded-full bg-sign text-white hover:bg-ink">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </div>
      <div className="mx-auto my-auto w-full max-w-4xl px-4 pb-8">
        <SubwayMap riders={riders} />
        <p className="mt-3 text-center text-sm text-muted">This browser can&apos;t show the 3D map, so here&apos;s the simple one.</p>
      </div>
    </div>
  );
}
