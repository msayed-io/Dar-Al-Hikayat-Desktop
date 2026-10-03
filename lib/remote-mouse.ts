/**
 * Remote mouse — pointer bridge for the wireless Story Keyboard.
 *
 * The phone (كيبورد الحكايات) sends tiny HTTP GETs to the tablet's local server:
 *   /api/command?action=mouse&dx=12&dy=-4
 *   /api/command?action=mouse_click&button=left|right
 *   /api/command?action=mouse_scroll&deltaY=120
 *   /api/command?action=mouse_down|mouse_up&button=left
 *   /api/command?action=mouse_mode&enabled=1|0
 *
 * This module is deliberately DOM-only and dependency free so it can be unit
 * tested in jsdom: it owns the event bus, the cursor geometry and the synthetic
 * event dispatch. The React overlay (RemoteMouseCursor) only renders the arrow.
 */
import type { RemoteKeystrokePayload } from "./remote-keyboard-service";

export type RemoteMouseButton = "left" | "right" | "middle";

export type RemoteMouseAction =
  | "MOUSE_MODE"
  | "MOUSE_MOVE"
  | "MOUSE_CLICK"
  | "MOUSE_SCROLL"
  | "MOUSE_DOWN"
  | "MOUSE_UP";

export interface RemoteMouseCommand {
  action: RemoteMouseAction;
  /** Relative movement in CSS pixels (MOUSE_MOVE). */
  dx?: number;
  dy?: number;
  /** Wheel delta in CSS pixels (MOUSE_SCROLL). */
  deltaY?: number;
  button?: RemoteMouseButton;
  /** 1 = single click, 2 = double click. */
  clicks?: number;
  enabled?: boolean;
}

type Listener = (command: RemoteMouseCommand) => void;

const listeners = new Set<Listener>();
let enabled = false;

/**
 * Real browsers synthesise `dblclick` from two quick clicks. Because the phone
 * sends one HTTP call per tap, the tablet tracks them itself: two left clicks
 * inside the window + radius become a genuine double click (instant taps stay
 * instant — no waiting for a double-tap timeout on the phone).
 */
const DOUBLE_CLICK_WINDOW_MS = 420;
const DOUBLE_CLICK_RADIUS_PX = 8;
let lastLeftClick = { at: 0, x: 0, y: 0 };

export function subscribeRemoteMouse(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isRemoteMouseEnabled(): boolean {
  return enabled;
}

/** Publishes a command to the overlay. MODE also flips the global flag. */
export function emitRemoteMouse(command: RemoteMouseCommand): void {
  if (command.action === "MOUSE_MODE") {
    enabled = command.enabled !== false;
  }
  listeners.forEach((listener) => {
    try {
      listener(command);
    } catch {
      // A broken listener must never block the remote input pipeline.
    }
  });
}

/** Hides the pointer and marks the remote mouse as inactive (disconnect). */
export function resetRemoteMouse(): void {
  lastLeftClick = { at: 0, x: 0, y: 0 };
  if (!enabled) return;
  emitRemoteMouse({ action: "MOUSE_MODE", enabled: false });
}

/** Silent reset used on unmount: no listener churn, just clears the flag. */
export function deactivateRemoteMouse(): void {
  enabled = false;
}

/** Translates a decoded keystroke payload into a mouse command. */
export function parseRemoteMousePayload(payload: RemoteKeystrokePayload): RemoteMouseCommand | null {
  if (!payload || payload.type !== "MOUSE") return null;
  const action = payload.action;
  if (
    action !== "MOUSE_MODE" &&
    action !== "MOUSE_MOVE" &&
    action !== "MOUSE_CLICK" &&
    action !== "MOUSE_SCROLL" &&
    action !== "MOUSE_DOWN" &&
    action !== "MOUSE_UP"
  ) {
    return null;
  }
  return {
    action,
    dx: Number.isFinite(payload.dx) ? (payload.dx as number) : 0,
    dy: Number.isFinite(payload.dy) ? (payload.dy as number) : 0,
    deltaY: Number.isFinite(payload.deltaY) ? (payload.deltaY as number) : 0,
    button: payload.button,
    clicks: payload.clicks && payload.clicks > 1 ? 2 : 1,
    enabled: payload.enabled !== false,
  };
}

/** Emits a mouse command straight from an incoming remote payload. */
export function handleRemoteMousePayload(payload: RemoteKeystrokePayload): boolean {
  const command = parseRemoteMousePayload(payload);
  if (!command) return false;
  emitRemoteMouse(command);
  return true;
}

export function normalizeMouseButton(value: unknown): RemoteMouseButton {
  return value === "right" || value === "middle" ? value : "left";
}

/** Range-safe coordinate: NaN/-Infinity → minimum, +Infinity → maximum. */
function safeCoord(value: number, min: number, max: number): number {
  if (typeof value !== "number" || Number.isNaN(value) || value === -Infinity) return min;
  if (value === Infinity) return max;
  return Math.min(Math.max(value, min), max);
}

/** Keeps the pointer fully inside the viewport with a small safety margin. */
export function clampCursor(
  x: number,
  y: number,
  width: number,
  height: number,
  margin = 8,
): { x: number; y: number } {
  const maxX = Math.max(margin, width - margin);
  const maxY = Math.max(margin, height - margin);
  return { x: safeCoord(x, margin, maxX), y: safeCoord(y, margin, maxY) };
}

/** DOM `buttons` bitmask for a given remote button. */
export function buttonMask(button: RemoteMouseButton): number {
  if (button === "right") return 2;
  if (button === "middle") return 4;
  return 1;
}

function makeMouseEvent(
  type: string,
  x: number,
  y: number,
  button: number,
  buttons: number,
  detail = 1,
): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button,
    buttons,
    detail,
  });
}

function makeWheelEvent(x: number, y: number, deltaY: number): Event {
  const Ctor = (typeof window !== "undefined" ? (window as any).WheelEvent : undefined);
  if (typeof Ctor === "function") {
    try {
      return new Ctor("wheel", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        deltaX: 0,
        deltaY,
        deltaMode: 0,
      });
    } catch {
      // fall through to a plain event
    }
  }
  const fallback: any = new Event("wheel", { bubbles: true, cancelable: true });
  fallback.deltaX = 0;
  fallback.deltaY = deltaY;
  fallback.deltaMode = 0;
  fallback.clientX = x;
  fallback.clientY = y;
  return fallback;
}

/** The element currently under the remote pointer (never the overlay itself). */
export function elementAtPoint(x: number, y: number): Element | null {
  if (typeof document === "undefined") return null;
  const pointFn = (document as any).elementFromPoint;
  if (typeof pointFn !== "function") return null;
  return document.elementFromPoint(x, y) as Element | null;
}

/** Nearest ancestor that can actually scroll vertically. */
export function findScrollableAncestor(start: Element | null): HTMLElement | null {
  let node: Element | null = start;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node instanceof HTMLElement) {
      const style = typeof window !== "undefined" && window.getComputedStyle ? window.getComputedStyle(node) : null;
      const overflowY = style ? style.overflowY : "";
      if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
        return node;
      }
    }
    node = node.parentElement;
  }
  return null;
}

export interface RemoteDispatchResult {
  target: Element | null;
  /** False when a handler called preventDefault() (e.g. a custom wheel handler). */
  accepted: boolean;
}

/**
 * Dispatches the real DOM event sequence for a remote command at (x, y).
 * Clicks travel to `document.elementFromPoint` so the phone can press real
 * buttons: save, theme, chapters, tabs... Backspace/typing stay untouched.
 */
export function dispatchRemoteMouseAt(
  command: RemoteMouseCommand,
  x: number,
  y: number,
): RemoteDispatchResult {
  const target = elementAtPoint(x, y) || document.body;

  switch (command.action) {
    case "MOUSE_CLICK": {
      const button = normalizeMouseButton(command.button);
      const mask = buttonMask(button);
      const clicks = command.clicks && command.clicks > 1 ? 2 : 1;
      const buttonIndex = button === "right" ? 2 : button === "middle" ? 1 : 0;
      let effectiveClicks = clicks;
      if (button === "left") {
        const now = Date.now();
        const isSecondTap =
          clicks < 2 &&
          now - lastLeftClick.at < DOUBLE_CLICK_WINDOW_MS &&
          Math.hypot(x - lastLeftClick.x, y - lastLeftClick.y) < DOUBLE_CLICK_RADIUS_PX;
        if (isSecondTap) effectiveClicks = 2;
        lastLeftClick = { at: now, x, y };
      }
      target.dispatchEvent(makeMouseEvent("mousedown", x, y, buttonIndex, mask, effectiveClicks));

      if (button === "right") {
        // Real browsers show the context menu instead of firing `click`.
        target.dispatchEvent(makeMouseEvent("contextmenu", x, y, 2, mask, effectiveClicks));
        target.dispatchEvent(makeMouseEvent("mouseup", x, y, 2, 0, effectiveClicks));
        const aux = makeMouseEvent("auxclick", x, y, 2, 0, effectiveClicks);
        target.dispatchEvent(aux);
        return { target, accepted: !aux.defaultPrevented };
      }

      target.dispatchEvent(makeMouseEvent("mouseup", x, y, buttonIndex, 0, effectiveClicks));
      if (button === "middle") {
        const aux = makeMouseEvent("auxclick", x, y, 1, 0, effectiveClicks);
        target.dispatchEvent(aux);
        return { target, accepted: !aux.defaultPrevented };
      }

      const click = makeMouseEvent("click", x, y, 0, 0, effectiveClicks);
      target.dispatchEvent(click);
      if (effectiveClicks > 1) {
        target.dispatchEvent(makeMouseEvent("dblclick", x, y, 0, 0, effectiveClicks));
      }
      return { target, accepted: !click.defaultPrevented };
    }

    case "MOUSE_DOWN":
    case "MOUSE_UP": {
      const button = normalizeMouseButton(command.button);
      const mask = command.action === "MOUSE_DOWN" ? buttonMask(button) : 0;
      const type = command.action === "MOUSE_DOWN" ? "mousedown" : "mouseup";
      const event = makeMouseEvent(type, x, y, button === "right" ? 2 : 0, mask);
      const accepted = target.dispatchEvent(event);
      return { target, accepted };
    }

    case "MOUSE_SCROLL": {
      const deltaY = Number.isFinite(command.deltaY) ? (command.deltaY as number) : 0;
      if (!deltaY) return { target, accepted: true };
      const wheel = makeWheelEvent(x, y, deltaY);
      const accepted = target.dispatchEvent(wheel);
      if (accepted) {
        // Nothing consumed the wheel: scroll the page/panel like a real mouse.
        const scrollable = findScrollableAncestor(target);
        if (scrollable) {
          scrollable.scrollTop += deltaY;
        } else if (typeof window !== "undefined" && typeof (window as any).scrollBy === "function") {
          (window as any).scrollBy(0, deltaY);
        }
      }
      return { target, accepted };
    }

    default:
      return { target, accepted: true };
  }
}
