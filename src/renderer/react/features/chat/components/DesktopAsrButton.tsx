import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "../../../i18n";
import { DesktopAsrController, type DictationState } from "./desktop-asr-controller";
import { openDictationMicrophone } from "./desktop-asr-audio";

/** Mount with a conversation-specific key so changing drafts cancels old audio. */
export function DesktopAsrButton({ onText }: { onText: (text: string) => void }) {
  const { t } = useTranslation();
  const [state, setState] = useState<DictationState>("idle");
  const [error, setError] = useState<string>();
  const callback = useRef(onText);
  useLayoutEffect(() => { callback.current = onText; }, [onText]);
  const controller = useRef<DesktopAsrController | null>(null);
  // Revoke ownership during the commit, before late promises or passive cleanup.
  useLayoutEffect(() => {
    if (!window.desktopAsr) return;
    let mounted = true;
    let phase: DictationState = "idle";
    const current = new DesktopAsrController({ api: window.desktopAsr, capture: openDictationMicrophone, isFocused: () => document.hasFocus(),
      onText: text => { if (mounted && document.hasFocus()) callback.current(text); },
      onState: (next, failure) => { phase = next; if (mounted) { setState(next); setError(failure); } },
    });
    controller.current = current;
    const cancel = () => current.cancel();
    // Native microphone permission dialogs can temporarily take focus during setup.
    const blur = () => { if (phase !== "starting") current.cancel(); };
    const visibility = () => { if (document.visibilityState === "hidden") current.cancel(); };
    window.addEventListener("pagehide", cancel); window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => { mounted = false; current.dispose(); controller.current = null; window.removeEventListener("pagehide", cancel); window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  const label = t(`dictation.${state === "recording" ? "stop" : state === "idle" ? "start" : state}`);
  return <span className="cy-composer__dictation">
    <button type="button" className="cy-composer__footer-button" title={t("dictation.hint")} aria-label={label}
      aria-pressed={state === "recording"} disabled={state === "starting" || state === "stopping"}
      onClick={() => { if (!controller.current) { setError("unavailable"); return; } if (state === "recording") void controller.current.stop(); else void controller.current.start(); }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>
      <span>{label}</span>
    </button>
    {state !== "idle" && <button type="button" className="cy-composer__footer-button" onClick={() => controller.current?.cancel()}>{t("dictation.cancel")}</button>}
    {error && <span className="cy-composer__dictation-error" role="alert">{t(`dictation.error.${error}`)}</span>}
    {state !== "idle" && <span className="cy-composer__dictation-status" role="status">{t("dictation.hint")}</span>}
  </span>;
}
