import { useEffect, useRef, type RefObject } from 'react';

/** One keyboard/focus contract for docked-workspace drawers and portal dialogs. */
export function useModalFocus({ panel, open, identity, onClose, returnFocus }: {
  panel: RefObject<HTMLElement | null>; open: boolean; identity?: unknown;
  onClose(): void; returnFocus?(): HTMLElement | null;
}) {
  const actions = useRef({ onClose, returnFocus });
  actions.current = { onClose, returnFocus };
  useEffect(() => {
    const current = panel.current;
    if (!open || !current) return;
    const origin = document.activeElement as HTMLElement | null;
    const background: Array<[HTMLElement, boolean]> = [];
    for (let node: HTMLElement | null = current; node?.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node && sibling instanceof HTMLElement && !sibling.classList.contains('module-backdrop')) {
          background.push([sibling, sibling.hasAttribute('inert')]); sibling.setAttribute('inert', '');
        }
      }
      if (node.parentElement === document.body) break;
    }
    const controls = () => [...current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]')]
      .filter(el => !el.closest('[hidden],[inert]') && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden')
      .filter(el => ![...current.querySelectorAll('details:not([open])')].some(details => details.contains(el) && details.querySelector(':scope > summary') !== el));
    if (!current.contains(document.activeElement)) (controls()[0] ?? current).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); actions.current.onClose(); }
      if (event.key !== 'Tab') return;
      const all = controls(), first = all[0], last = all.at(-1);
      if (!first || !last) { event.preventDefault(); current.focus(); return; }
      if (!current.contains(document.activeElement) || event.shiftKey && document.activeElement === first) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      for (const [element, wasInert] of background) if (!wasInert) element.removeAttribute('inert');
      const stillEditing = current.isConnected && !current.hidden && current.contains(document.activeElement);
      const target = actions.current.returnFocus?.() ?? origin;
      if (!stillEditing && target?.isConnected) target.focus();
    };
  }, [open, identity, panel]);
}
