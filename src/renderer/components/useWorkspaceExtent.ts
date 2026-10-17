import { useLayoutEffect, useState, type RefObject } from 'react';

/** Measure content coordinates so scrolling never grows a region's height. */
export function useWorkspaceExtent(ref: RefObject<HTMLElement | null>, enabled = true) {
  const [extent, setExtent] = useState({ width: 0, height: 240 });
  useLayoutEffect(() => {
    if (!enabled || !ref.current) return;
    const root = ref.current;
    const workspace = root.closest<HTMLElement>('.workspace');
    const page = root.closest<HTMLElement>('.page-surface');
    const measure = () => {
      const box = root.getBoundingClientRect();
      const padding = workspace ? parseFloat(getComputedStyle(workspace).paddingBottom) || 0 : 0;
      // offsetTop excludes entry-animation transforms and stays stable on scrolling.
      const layoutTop = (element: HTMLElement) => {
        let top = 0;
        for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
        return top;
      };
      const height = workspace && workspace.clientHeight > 0
        ? workspace.clientHeight - (layoutTop(root) - layoutTop(workspace)) - padding - 8
        : window.innerHeight - Math.max(54, box.top) - 16;
      const next = { width: box.width || window.innerWidth, height: Math.max(240, Math.floor(height)) };
      setExtent(previous => previous.width === next.width && previous.height === next.height ? previous : next);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    for (const node of [root, workspace, page]) if (node) observer?.observe(node);
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(measure);
    mutations?.observe(page ?? root, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); mutations?.disconnect(); window.removeEventListener('resize', measure); };
  }, [ref, enabled]);
  return extent;
}
