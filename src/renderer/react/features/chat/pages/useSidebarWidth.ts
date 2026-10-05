import { useEffect, useRef, useState, type PointerEvent } from "react";

const STORAGE_KEY = "firefly.chat.sidebar-width";
const MIN_WIDTH = 180;
const MAX_WIDTH = 360;
const DEFAULT_WIDTH = 240;
// Frame, rail and separators plus 600px for the horizontal chat/workspace dock.
function maximum(viewport: number) { return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, viewport - 710)); }
function clamp(width: number, viewport: number) { return Math.max(MIN_WIDTH, Math.min(maximum(viewport), width)); }
function savedWidth() {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(value) && value >= MIN_WIDTH && value <= MAX_WIDTH) return value;
  } catch { /* Layout remains usable when storage is unavailable. */ }
  return DEFAULT_WIDTH;
}

export function useSidebarWidth() {
  const [requested, setRequested] = useState(savedWidth);
  const requestedRef = useRef(requested);
  const [isResizing, setIsResizing] = useState(false);
  const [viewport, setViewport] = useState(() => typeof window === "undefined" ? 1280 : window.innerWidth);
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const save = () => { try { window.localStorage.setItem(STORAGE_KEY, String(requestedRef.current)); } catch { /* Optional persistence. */ } };
  const update = (value: number) => {
    requestedRef.current = clamp(value, window.innerWidth);
    setRequested(requestedRef.current);
  };
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth);
    const move = (event: globalThis.PointerEvent) => {
      if (drag.current?.pointerId !== event.pointerId) return;
      update(drag.current.width + event.clientX - drag.current.x);
    };
    const finish = (event: Event) => {
      if (!drag.current) return;
      if ("pointerId" in event && event.pointerId !== drag.current.pointerId) return;
      drag.current = null;
      setIsResizing(false);
      save();
    };
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
    };
  }, []);
  const width = clamp(requested, viewport);
  return {
    width, isResizing, min: MIN_WIDTH, max: maximum(viewport),
    beginResize(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      event.preventDefault();
      setIsResizing(true);
      drag.current = { pointerId: event.pointerId, x: event.clientX, width };
    },
    resizeBy(delta: number) { update(width + delta); save(); },
  };
}
