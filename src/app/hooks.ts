/**
 * Small, dependency-free shell hooks shared by the drawer, the command palette
 * and the sidebar. Kept together so focus and scroll behaviour is implemented
 * once and behaves identically in every overlay.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function visibleFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => {
    if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return false;
    return element.offsetWidth > 0 || element.offsetHeight > 0 || element === document.activeElement;
  });
}

/**
 * Traps Tab focus inside `ref` while `active`, focuses the first control, and
 * restores focus to the previously focused element on close.
 */
export function useFocusTrap(active: boolean, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      const [first] = visibleFocusable(container);
      (first || container).focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = visibleFocusable(container);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [active, ref]);
}

/**
 * Locks background scrolling (and compensates for the scrollbar width).
 *
 * Reference counted, because overlays stack: the command palette can be opened
 * on top of the mobile drawer. With the previous save/restore pair, closing the
 * drawer first restored `overflow: ''` (unlocking the page under the palette)
 * and closing the palette last restored `overflow: 'hidden'` — leaving the whole
 * application permanently unscrollable until a reload. One shared lock state
 * removes that ordering hazard entirely.
 */
let bodyLockCount = 0;
let bodyLockSnapshot: { overflow: string; paddingRight: string } | null = null;

function acquireBodyLock() {
  if (typeof document === 'undefined') return;
  const { body, documentElement } = document;
  if (bodyLockCount === 0) {
    const scrollbar = window.innerWidth - documentElement.clientWidth;
    bodyLockSnapshot = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  }
  bodyLockCount += 1;
}

function releaseBodyLock() {
  if (typeof document === 'undefined') return;
  if (bodyLockCount === 0) return;
  bodyLockCount -= 1;
  if (bodyLockCount > 0) return;
  const { body } = document;
  const snapshot = bodyLockSnapshot;
  bodyLockSnapshot = null;
  // Restore to the value the *first* lock saw, not to a stacked intermediate.
  body.style.overflow = snapshot?.overflow ?? '';
  body.style.paddingRight = snapshot?.paddingRight ?? '';
}

/** Test seam: reports the current lock state without touching the DOM. */
export function getBodyLockCount() {
  return bodyLockCount;
}

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    acquireBodyLock();
    return releaseBodyLock;
  }, [locked]);
}

/** Escape-key handler that only listens while `active`. */
export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onEscape();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, onEscape]);
}

/**
 * Enter/Space activation for an element that is not a real `<button>`.
 *
 * A `role="button"` on a div gets the screen-reader semantics but none of the
 * behaviour: the browser will not synthesise a click from the keyboard. Every
 * such element is either converted to a real button or given this handler, and
 * `scripts/test-a11y-controls.mjs` fails the build for anything that has
 * neither.
 */
export function activateOnKey(handler: () => void) {
  return (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter') {
      handler();
      return;
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      // Space would otherwise scroll the page under the control.
      event.preventDefault();
      handler();
    }
  };
}

/** Media query as state (SSR-safe). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    if (media.addEventListener) media.addEventListener('change', onChange);
    else media.addListener(onChange);
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', onChange);
      else media.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

/** Debounced value — used by the command palette filter and future search. */
export function useDebouncedValue<T>(value: T, delay = 120): T {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(value), delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, delay]);
  return debounced;
}
