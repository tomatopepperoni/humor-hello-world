import { splitErrorDetail } from "@/lib/errors";

/**
 * Errors from the caption model, written the way the subway announces problems.
 * "busy" (Gemini overloaded / rate-limited) is a yellow Delays notice: nothing is
 * wrong with what you did, try again shortly. Anything else is a red notice.
 */
export default function ServiceAlert({
  error,
  busy,
  keptInput = false,
}: {
  error: string;
  busy: boolean;
  keptInput?: boolean;
}) {
  const { message, detail } = splitErrorDetail(error);
  return (
    <div
      role="alert"
      className={`flex gap-3 rounded-xl p-4 text-sm ${busy ? "bg-metro text-ink" : "border border-bullet-red/30 bg-bullet-red/5 text-ink"}`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-6 w-6 shrink-0 rotate-45 items-center justify-center rounded-[3px] ${busy ? "bg-sign" : "bg-bullet-red"}`}
      >
        <span className={`-rotate-45 text-sm font-bold ${busy ? "text-metro" : "text-white"}`}>!</span>
      </span>
      <div className="min-w-0">
        <p className="font-bold">{busy ? "Delays on the Gemini line" : "The captions weren't written"}</p>
        <p className="mt-1">
          {busy
            ? "Google's caption model is getting too many requests right now. Wait about a minute, then try again."
            : message}
        </p>
        {keptInput && <p className="mt-1">Your photo, text and vibe are still here, so you only need to press the button again.</p>}
        {(busy || detail) && (
          <p className={`mt-2 break-words text-xs ${busy ? "text-ink/70" : "text-muted"}`}>{detail ?? message}</p>
        )}
      </div>
    </div>
  );
}
