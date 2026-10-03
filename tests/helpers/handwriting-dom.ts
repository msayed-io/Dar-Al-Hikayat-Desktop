/**
 * Shared jsdom harness for the handwriting suites.
 *
 * jsdom has no layout engine and no canvas implementation, so every test below
 * describes ONLY the browser surface the components actually touch:
 *   - a 2D context whose `translate` calls can be asserted (pan/reader checks),
 *   - `toDataURL` as a spy so "did we serialize a PNG?" is observable,
 *   - a viewport-sized `getBoundingClientRect` so pointer hit-testing is real,
 *   - stable empty/sample stroke references (identity churn causes effect loops),
 *   - pointer dispatch that mirrors the component's native listeners
 *     (pointerdown on the canvas node, move/up/cancel on window).
 *
 * The inking geometry itself is never simulated here; these helpers only feed
 * gestures through the real event pipeline.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi, type Mock } from "vitest";
import type { Stroke } from "../../components/DarAlHikayatHandwriting";
import type { ThemeColors } from "../../contexts/AppContext";

export const theme: ThemeColors = {
  mode: "royal_classic",
  bg: "#EAE6D2",
  text: "#121A1B",
  accent: "#A7AA63",
  secondary: "#4A5556",
  glass: "rgba(244, 241, 228, 0.96)",
  border: "rgba(18, 26, 27, 0.12)",
  shadow: "0 4px 30px rgba(0,0,0,0.4)",
  isDark: false,
};

/** Module constants: new arrays on every render would restart sync effects. */
export const EMPTY_STROKES: Stroke[] = [];

export const sampleStrokes: Stroke[] = [
  {
    id: "saved_1",
    color: "#121A1B",
    width: 3.5,
    points: [
      { x: 52, y: 150, pressure: 0.5, time: 0 },
      { x: 86, y: 168, pressure: 0.5, time: 16 },
      { x: 120, y: 186, pressure: 0.5, time: 32 },
    ],
  },
];

export const CANVAS_SELECTOR = "#handwriting-canvas-layer";
export const LAYER_SELECTOR = "#handwriting-document-layer";

export interface DomHarness {
  host: HTMLElement;
  context: { translate: Mock; save: Mock; restore: Mock } & Record<string, any>;
  encode: Mock;
  render(node: React.ReactElement): Promise<void>;
  cleanup(): void;
}

const VIEWPORT = () => ({
  width: typeof window.innerWidth === "number" ? window.innerWidth : 1024,
  height: typeof window.innerHeight === "number" ? window.innerHeight : 768,
});

function viewportRect() {
  const { width, height } = VIEWPORT();
  return {
    x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Queries an element and fails loudly — a missing node is always a bug here. */
export function element<T extends Element = HTMLElement>(selector: string): T {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Expected element matching ${selector}`);
  return node as T;
}

/** jsdom omits some layout APIs entirely; spy when present, define otherwise. */
function defineMethod(target: any, name: string, impl: (...args: any[]) => any) {
  const spy = vi.fn(impl);
  if (typeof target[name] === "function") vi.spyOn(target, name).mockImplementation(spy);
  else Object.defineProperty(target, name, { configurable: true, writable: true, value: spy });
  return spy;
}

export function setupDom(): DomHarness {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  const host = document.createElement("div");
  host.id = "handwriting-test-host";
  document.body.appendChild(host);
  localStorage.clear();

  // Canvas: jsdom throws "not implemented" for real drawing calls.
  const context: any = {};
  for (const method of [
    "save", "restore", "clearRect", "fillRect", "strokeRect", "beginPath", "closePath",
    "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "arc", "arcTo", "ellipse",
    "stroke", "fill", "clip", "scale", "translate", "rotate", "setTransform", "transform",
    "resetTransform", "setLineDash", "getLineDash", "drawImage", "putImageData",
  ]) {
    context[method] = vi.fn();
  }
  context.measureText = vi.fn(() => ({ width: 0 }));
  context.getImageData = vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }));
  context.createLinearGradient = vi.fn(() => ({ addColorStop: vi.fn() }));
  context.createRadialGradient = vi.fn(() => ({ addColorStop: vi.fn() }));
  context.canvas = null;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context);

  const encode = vi
    .spyOn(HTMLCanvasElement.prototype, "toDataURL")
    .mockReturnValue("data:image/png;base64,ENCODED") as unknown as Mock;

  // jsdom reports a zero rect for every node; pointer hit-testing needs a page.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(viewportRect);
  defineMethod(Element.prototype, "scrollIntoView", () => undefined);
  defineMethod(Element.prototype, "releasePointerCapture", () => undefined);
  defineMethod(Element.prototype, "setPointerCapture", () => undefined);

  // rAF is routed through setTimeout so fake timers control pending repaints too.
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16) as unknown as number);
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(() => false),
    })),
  });
  Object.defineProperty(window, "scrollTo", { configurable: true, writable: true, value: vi.fn() });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    writable: true,
    value: {
      width: 1024, height: 768, offsetTop: 0, offsetLeft: 0, scale: 1,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    },
  });
  Object.defineProperty(document, "execCommand", { configurable: true, writable: true, value: vi.fn(() => true) });
  Object.defineProperty(document, "queryCommandSupported", { configurable: true, writable: true, value: vi.fn(() => true) });
  Object.defineProperty(document, "queryCommandState", { configurable: true, writable: true, value: vi.fn(() => false) });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined), readText: vi.fn().mockResolvedValue("") },
  });
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: vi.fn(() => true) });

  let root: Root | null = null;
  const render = async (node: React.ReactElement) => {
    await act(async () => {
      if (!root) root = createRoot(host);
      root.render(node);
    });
  };

  const cleanup = () => {
    if (root) {
      act(() => root!.unmount());
      root = null;
    }
    host.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  };

  return { host, context, encode, render, cleanup };
}

type Target = string | Element | Window;

function resolve(target: Target): EventTarget {
  if (typeof target === "string") return element(target);
  return target as EventTarget;
}

export async function click(target: Target): Promise<void> {
  const node = resolve(target);
  await act(async () => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

export async function input(target: Target, value: string): Promise<void> {
  const node = resolve(target) as HTMLInputElement | HTMLTextAreaElement;
  const isTextArea = node.tagName === "TEXTAREA";
  const proto = isTextArea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  await act(async () => {
    if (setter) setter.call(node, value);
    else node.value = value;
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

export async function pointer(
  target: Target,
  type: string,
  x = 100,
  y = 180,
  pointerId = 1,
): Promise<void> {
  const node = resolve(target);
  await act(async () => {
    const init: any = {
      bubbles: true, cancelable: true, composed: true,
      clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y,
      button: 0, buttons: type === "pointerup" ? 0 : 1,
      pointerId, pointerType: "touch", isPrimary: pointerId === 1, pressure: 0.5,
    };
    let event: Event;
    const PointerEventCtor = (window as any).PointerEvent;
    if (typeof PointerEventCtor === "function") {
      event = new PointerEventCtor(type, init);
    } else {
      event = new MouseEvent(type, init);
      for (const key of ["pointerId", "pointerType", "isPrimary", "pressure"]) {
        Object.defineProperty(event, key, { value: init[key], configurable: true });
      }
    }
    node.dispatchEvent(event);
  });
}

/** One complete finger gesture: down on the canvas, moves/up on the window. */
export async function draw(
  trail: Array<[number, number]> = [[100, 180], [130, 202], [160, 214], [190, 226]],
): Promise<void> {
  const [first, ...rest] = trail;
  await pointer(CANVAS_SELECTOR, "pointerdown", first[0], first[1]);
  for (const [x, y] of rest) await pointer(window, "pointermove", x, y);
  const [lastX, lastY] = rest.length ? rest[rest.length - 1] : first;
  await pointer(window, "pointerup", lastX, lastY);
}
