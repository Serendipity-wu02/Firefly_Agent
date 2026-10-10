import { useEffect, useState, type RefObject } from "react";

/** Observe available chat space, including sidebar changes, without remounting a run. */
export function useCompactDock(ref: RefObject<HTMLDivElement | null>): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = (width: number) => setCompact(width < 600);
    update(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return compact;
}
