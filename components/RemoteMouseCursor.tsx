/**
 * RemoteMouseCursor — the on-tablet pointer driven by the Story Keyboard phone.
 *
 * Rendering rules (learned from the handwriting layer work):
 *  - It lives in a body portal so no parent `transform`/`overflow` can trap it.
 *  - `pointer-events: none` so `document.elementFromPoint` always resolves the
 *    real app element underneath; the overlay can never swallow a tap.
 *  - Movement deltas arrive at ~160 Hz; a rAF easing loop turns them into
 *    silky movement without touching React state per packet (zero re-renders).
 */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  clampCursor,
  dispatchRemoteMouseAt,
  parseRemoteMousePayload,
  subscribeRemoteMouse,
  type RemoteMouseCommand,
} from "../lib/remote-mouse";
import type { RemoteKeystrokePayload } from "../lib/remote-keyboard-service";

export interface RemoteMouseCursorProps {
  accent?: string;
  isDark?: boolean;
}

const EASING = 0.5;

export const RemoteMouseCursor: React.FC<RemoteMouseCursorProps> = ({
  accent = "#D97706",
  isDark = true,
}) => {
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rippleKey, setRippleKey] = useState(0);

  const targetRef = useRef({ x: 0, y: 0, ready: false });
  const currentRef = useRef({ x: 0, y: 0 });
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const paint = () => {
    const node = nodeRef.current;
    if (!node) return;
    node.style.transform = `translate3d(${Math.round(currentRef.current.x)}px, ${Math.round(currentRef.current.y)}px, 0)`;
  };

  const step = () => {
    rafRef.current = null;
    const target = targetRef.current;
    const current = currentRef.current;
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) {
      current.x = target.x;
      current.y = target.y;
      paint();
      return;
    }
    current.x += dx * EASING;
    current.y += dy * EASING;
    paint();
    schedule();
  };

  const schedule = () => {
    if (rafRef.current != null) return;
    if (typeof requestAnimationFrame !== "function") {
      step();
      return;
    }
    rafRef.current = requestAnimationFrame(step);
  };

  const ensurePosition = () => {
    const width = typeof window !== "undefined" ? window.innerWidth : 1024;
    const height = typeof window !== "undefined" ? window.innerHeight : 768;
    if (!targetRef.current.ready) {
      const start = clampCursor(width / 2, height / 2, width, height);
      targetRef.current = { x: start.x, y: start.y, ready: true };
      currentRef.current = { ...currentRef.current, x: start.x, y: start.y };
    } else {
      const clamped = clampCursor(targetRef.current.x, targetRef.current.y, width, height);
      targetRef.current.x = clamped.x;
      targetRef.current.y = clamped.y;
    }
  };

  const applyCommand = (command: RemoteMouseCommand) => {
    switch (command.action) {
      case "MOUSE_MODE": {
        const on = command.enabled !== false;
        setVisible(on);
        if (on) {
          ensurePosition();
          paint();
        }
        break;
      }
      case "MOUSE_MOVE": {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const next = clampCursor(
          targetRef.current.x + (command.dx || 0),
          targetRef.current.y + (command.dy || 0),
          width,
          height,
        );
        targetRef.current = { x: next.x, y: next.y, ready: true };
        targetRef.current.ready = true;
        schedule();
        break;
      }
      case "MOUSE_CLICK": {
        dispatchRemoteMouseAt(command, currentRef.current.x, currentRef.current.y);
        setRippleKey((key) => key + 1);
        break;
      }
      case "MOUSE_DOWN": {
        setDragging(true);
        dispatchRemoteMouseAt(command, currentRef.current.x, currentRef.current.y);
        break;
      }
      case "MOUSE_UP": {
        setDragging(false);
        dispatchRemoteMouseAt(command, currentRef.current.x, currentRef.current.y);
        break;
      }
      case "MOUSE_SCROLL": {
        dispatchRemoteMouseAt(command, currentRef.current.x, currentRef.current.y);
        break;
      }
      default:
        break;
    }
  };

  useEffect(() => subscribeRemoteMouse(applyCommand), []);

  useEffect(() => {
    if (!visible) return;
    ensurePosition();
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    const onResize = () => {
      ensurePosition();
      // The drawn position must obey the new bounds immediately (rotation).
      const clamped = clampCursor(currentRef.current.x, currentRef.current.y, window.innerWidth, window.innerHeight);
      currentRef.current.x = clamped.x;
      currentRef.current.y = clamped.y;
      paint();
      schedule();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current != null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
    },
    [],
  );

  if (!visible) return null;

  const strokeColor = isDark ? "#F8FAFC" : "#0F172A";

  return createPortal(
    <div
      ref={nodeRef}
      data-remote-mouse-cursor="true"
      aria-hidden="true"
      dir="ltr"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        zIndex: 2147483000,
        pointerEvents: "none",
        willChange: "transform",
        transform: "translate3d(-100px, -100px, 0)",
        opacity: 0,
        transition: "opacity 160ms ease",
      }}
    >
      <style>{`
        [data-remote-mouse-cursor="true"] { opacity: 1 !important; }
        @keyframes darRemoteMouseRipple {
          0% { transform: scale(.35); opacity: .85; }
          100% { transform: scale(2.1); opacity: 0; }
        }
        @keyframes darRemoteMouseHold {
          0%, 100% { transform: scale(1); opacity: .9; }
          50% { transform: scale(1.18); opacity: .65; }
        }
      `}</style>

      {/* Pointer arrow */}
      <svg
        width="26"
        height="34"
        viewBox="0 0 26 34"
        style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.45))" }}
      >
        <path
          d="M3 1.6 L3 26.2 L9.6 20.4 L13.7 30.6 L18.6 28.5 L14.6 18.6 L23.2 18.1 Z"
          fill={strokeColor}
          stroke={accent}
          strokeWidth="1.7"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      {/* Click ripple */}
      <span
        key={rippleKey}
        style={{
          position: "absolute",
          left: -13,
          top: -13,
          width: 26,
          height: 26,
          borderRadius: "50%",
          border: `2px solid ${accent}`,
          animation: rippleKey > 0 ? "darRemoteMouseRipple .45s ease-out forwards" : "none",
        }}
      />

      {/* Drag indicator */}
      {dragging && (
        <span
          style={{
            position: "absolute",
            left: -16,
            top: -16,
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: `2px dashed ${accent}`,
            animation: "darRemoteMouseHold 1.4s ease-in-out infinite",
          }}
        />
      )}
    </div>,
    document.body,
  );
};

/**
 * Convenience bridge for the editor: consumes remote payloads of type MOUSE.
 * Returns true when the payload was a mouse command (and must not be treated
 * as text input — this is what used to pop the tablet keyboard by accident).
 */
export function isRemoteMouseInput(payload: RemoteKeystrokePayload): boolean {
  return parseRemoteMousePayload(payload) !== null;
}

export default RemoteMouseCursor;
