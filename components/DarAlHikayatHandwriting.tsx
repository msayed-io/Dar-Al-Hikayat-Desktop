import React, { useRef, useEffect, useLayoutEffect, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, ChevronRight, MoreHorizontal, Eraser as EraserIcon, Trash2, XCircle, Check, Undo2, Redo2 } from "lucide-react";
import { ThemeColors } from "../contexts/AppContext";
import { eraseStrokePortion } from "../lib/handwriting-eraser";

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  time: number;
}

export interface Stroke {
  id: string;
  color: string;
  width: number;
  points: StrokePoint[];
}

export interface HandwritingHandle {
  getStrokes: () => Stroke[];
  getDataUrl: () => string;
  clear: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

interface DarAlHikayatHandwritingProps {
  isActive: boolean;
  isReadingMode?: boolean;
  onClose: () => void;
  onDiscard?: () => void;
  theme: ThemeColors;
  initialStrokes?: Stroke[];
  initialPageRuled?: boolean;
  onStrokesChange?: (strokes: Stroke[], isPageRuled: boolean, dataUrl: string) => void;
  containerRef?: React.RefObject<HTMLElement | null>;
  onUndoChange?: (canUndo: boolean, canRedo: boolean) => void;
  backgroundStyle?: React.CSSProperties;
  title?: string;
}

// Preset stroke thickness values with noticeable, distinct sizes from ultra-thin calligraphy to bold heading nib
const THICKNESS_PRESETS = [
  { label: "دقيق جداً (ريشة رفيعة)", value: 1.5, svgWidth: 1.0, dotSize: 3 },
  { label: "دقيق (خط النسخ)", value: 3.5, svgWidth: 2.5, dotSize: 5 },
  { label: "متوسط (خط الرقعة)", value: 7.0, svgWidth: 4.8, dotSize: 8 },
  { label: "عريض (خط الثلث)", value: 13.0, svgWidth: 8.0, dotSize: 12 },
  { label: "عريض جداً (قلم التمييز والتعريض)", value: 24.0, svgWidth: 13.0, dotSize: 18 },
];

// Curated 8 color palette aligned with Dar Al Hikayat
const COLOR_PALETTE = [
  { hex: "#FFFFFF", name: "أبيض ناصع", lightHex: "#121A1B" },
  { hex: "#A7AA63", name: "ذهب دار الحكايات", lightHex: "#888C3E" },
  { hex: "#3B82F6", name: "أزرق حبري ملكي", lightHex: "#2563EB" },
  { hex: "#0EA5E9", name: "سماوي صافي", lightHex: "#0284C7" },
  { hex: "#10B981", name: "زمردي إسلامي", lightHex: "#059669" },
  { hex: "#F59E0B", name: "عنبر وذهب", lightHex: "#D97706" },
  { hex: "#EF4444", name: "قرمزي ياقوتي", lightHex: "#DC2626" },
  { hex: "#9333EA", name: "أرجواني ملكي", lightHex: "#7E22CE" },
];

type PopupType = "none" | "thickness" | "color" | "options" | "eraser";

export const DarAlHikayatHandwriting = forwardRef<HandwritingHandle, DarAlHikayatHandwritingProps>(
  ({ isActive, isReadingMode = false, onClose, onDiscard, theme, initialStrokes = [], initialPageRuled = false, onStrokesChange, containerRef, onUndoChange, backgroundStyle, title }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ruledCanvasRef = useRef<HTMLCanvasElement>(null);

    // تتبع وجود اللوحة في الـ DOM: المكوّن يعيد null وهو غير نشط، فتنشأ اللوحتان
    // لحظة التفعيل فقط — ويجب إعادة تجميع المخزن المؤقت فور إنشائهما قبل أول
    // رسمة، وإلا بقي مقاس HTML الافتراضي 300×150 بينما تمتدّ اللوحة على كامل
    // الشاشة (جذر مشكلة الخطوط العملاقة والضبابية المتباعدة عن الإصبع).
    const [canvasNode, setCanvasNode] = useState<HTMLCanvasElement | null>(null);
    const assignCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
      canvasRef.current = node;
      setCanvasNode(node);
    }, []);

    // Drawing Tool States
    const [activeTool, setActiveTool] = useState<"pen" | "eraser">("pen");
    const [selectedThickness, setSelectedThickness] = useState<number>(3.5);
    const [selectedColor, setSelectedColor] = useState<string>(() => (theme.isDark ? "#FFFFFF" : "#121A1B"));
    const [isPageRuled, setIsPageRuled] = useState<boolean>(initialPageRuled);

    // Collapsed Capsule Dome State (Minimize/Expand)
    const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

    // Active popup capsule above bottom bar
    const [activePopup, setActivePopup] = useState<PopupType>("none");

    // Strokes & History for Undo/Redo
    const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes);
    const [history, setHistory] = useState<Stroke[][]>([initialStrokes]);
    const [historyIndex, setHistoryIndex] = useState<number>(0);

    // Infinite Canvas Vertical Pan State & Refs
    const [panY, setPanY] = useState<number>(0);
    const panYRef = useRef<number>(0);
    const isTwoFingerPanningRef = useRef<boolean>(false);
    const lastTwoFingerYRef = useRef<number>(0);
    const activePointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());

    // Reading Mode Navigation Refs
    const isMousePanningRef = useRef<boolean>(false);
    const lastMouseYRef = useRef<number>(0);

    // Drawing in-progress refs
    const isDrawingRef = useRef<boolean>(false);
    const currentPointsRef = useRef<StrokePoint[]>([]);
    const lastPointRef = useRef<StrokePoint | null>(null);
    const didEraseDuringDragRef = useRef<boolean>(false);
    const lastInternalStrokesRef = useRef<Stroke[]>(initialStrokes);

    const activeToolRef = useRef<"pen" | "eraser">("pen");
    const selectedThicknessRef = useRef<number>(3.5);
    const selectedColorRef = useRef<string>(theme.isDark ? "#FFFFFF" : "#121A1B");
    const strokesRef = useRef<Stroke[]>(initialStrokes);

    // Throttled Redraw RAF & Debounced DataURL Refs
    const redrawRafIdRef = useRef<number | null>(null);
    const dataUrlTimeoutRef = useRef<any>(null);

    // Spatial index of stroke bounding boxes for 100x faster O(1) eraser culling
    const strokeBoundsRef = useRef<Map<string, { minX: number; maxX: number; minY: number; maxY: number }>>(new Map());

    const getStrokeBounds = (stroke: Stroke) => {
      let bounds = strokeBoundsRef.current.get(stroke.id);
      if (!bounds) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < stroke.points.length; i++) {
          const p = stroke.points[i];
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        bounds = { minX, maxX, minY, maxY };
        strokeBoundsRef.current.set(stroke.id, bounds);
      }
      return bounds;
    };

    useEffect(() => {
      activeToolRef.current = activeTool;
    }, [activeTool]);
    useEffect(() => {
      selectedThicknessRef.current = selectedThickness;
    }, [selectedThickness]);
    useEffect(() => {
      selectedColorRef.current = selectedColor;
    }, [selectedColor]);
    useEffect(() => {
      strokesRef.current = strokes;
    }, [strokes]);

    // Keep default ink color in sync with theme changes
    useEffect(() => {
      const defaultInk = theme.isDark ? "#FFFFFF" : "#121A1B";
      setSelectedColor(defaultInk);
      selectedColorRef.current = defaultInk;
    }, [theme.isDark]);

    // High-performance batched canvas redraw
    const redrawAll = useCallback(
      (strokesToDraw: Stroke[], currentPanY: number = panYRef.current) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewportHeight = canvas.height / dpr;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale(dpr, dpr);
        ctx.translate(0, -currentPanY);

        for (let sIdx = 0; sIdx < strokesToDraw.length; sIdx++) {
          const stroke = strokesToDraw[sIdx];
          if (!stroke.points || stroke.points.length === 0) continue;

          ctx.strokeStyle = stroke.color;
          ctx.fillStyle = stroke.color;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.lineWidth = stroke.width;

          if (stroke.points.length === 1) {
            const p = stroke.points[0];
            ctx.beginPath();
            ctx.arc(p.x, p.y, stroke.width / 2, 0, Math.PI * 2);
            ctx.fill();
            continue;
          }

          ctx.beginPath();
          const p0 = stroke.points[0];
          ctx.moveTo(p0.x, p0.y);

          for (let i = 1; i < stroke.points.length; i++) {
            const pt0 = stroke.points[i - 1];
            const pt1 = stroke.points[i];
            const midX = (pt0.x + pt1.x) / 2;
            const midY = (pt0.y + pt1.y) / 2;
            ctx.quadraticCurveTo(pt0.x, pt0.y, midX, midY);
          }
          const lastPt = stroke.points[stroke.points.length - 1];
          ctx.lineTo(lastPt.x, lastPt.y);
          ctx.stroke();
        }

        ctx.restore();
      },
      []
    );

    // Throttled RAF scheduler to repaint at 60/120fps display rate without blocking JS thread
    const scheduleRedraw = useCallback(() => {
      if (redrawRafIdRef.current !== null) return;
      redrawRafIdRef.current = requestAnimationFrame(() => {
        redrawRafIdRef.current = null;
        redrawAll(strokesRef.current, panYRef.current);
      });
    }, [redrawAll]);

    useEffect(() => {
      return () => {
        if (redrawRafIdRef.current !== null) {
          cancelAnimationFrame(redrawRafIdRef.current);
          redrawRafIdRef.current = null;
        }
        if (dataUrlTimeoutRef.current) {
          clearTimeout(dataUrlTimeoutRef.current);
          dataUrlTimeoutRef.current = null;
        }
      };
    }, []);

    // Synchronize initial strokes only when note loads externally or changes from outside
    useEffect(() => {
      if (initialStrokes && initialStrokes !== lastInternalStrokesRef.current) {
        lastInternalStrokesRef.current = initialStrokes;
        setStrokes(initialStrokes);
        setHistory([initialStrokes]);
        setHistoryIndex(0);
        strokeBoundsRef.current.clear();
        redrawAll(initialStrokes, panYRef.current);
      }
    }, [initialStrokes, redrawAll]);

    useEffect(() => {
      setIsPageRuled(initialPageRuled);
    }, [initialPageRuled]);

    // Draw Ruled lines on background canvas across the infinite vertical page
    const drawRuledLines = useCallback(
      (currentPanY: number = panYRef.current) => {
        const canvas = ruledCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        if (!isPageRuled) return;

        const viewportHeight = canvas.height / dpr;
        const width = canvas.width / dpr;
        const lineHeight = 38;
        const startY = 80;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.translate(0, -currentPanY);

        ctx.strokeStyle = theme.isDark ? "rgba(226, 223, 210, 0.16)" : "rgba(18, 26, 27, 0.15)";
        ctx.lineWidth = 1;

        const firstLineIdx = Math.max(0, Math.floor((currentPanY - startY) / lineHeight));
        const lastLineIdx = Math.floor((currentPanY + viewportHeight + lineHeight - startY) / lineHeight);

        for (let i = firstLineIdx; i <= lastLineIdx; i++) {
          const y = startY + i * lineHeight;
          ctx.beginPath();
          ctx.moveTo(24, y);
          ctx.lineTo(width - 24, y);
          ctx.stroke();
        }
        ctx.restore();
      },
      [isPageRuled, theme.isDark]
    );

    // Resize canvas to match target container with device pixel ratio
    // (runs whenever the canvases mount/unmount — canvasNode — or layout changes)
    const resizeCanvases = useCallback(() => {
      const canvas = canvasRef.current;
      const ruledCanvas = ruledCanvasRef.current;
      if (!canvas || !ruledCanvas) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const docWidth = window.innerWidth || document.documentElement.clientWidth || 360;
      const docHeight = window.innerHeight || document.documentElement.clientHeight || 640;

      const targetW = Math.round(docWidth * dpr);
      const targetH = Math.round(docHeight * dpr);

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;

        ruledCanvas.width = targetW;
        ruledCanvas.height = targetH;

        redrawAll(strokesRef.current, panYRef.current);
        drawRuledLines(panYRef.current);
      }
    }, [redrawAll, drawRuledLines]);

    useLayoutEffect(() => {
      resizeCanvases();
      window.addEventListener("resize", resizeCanvases);
      window.visualViewport?.addEventListener("resize", resizeCanvases);
      const timer1 = setTimeout(resizeCanvases, 150);
      const timer2 = setTimeout(resizeCanvases, 400);
      return () => {
        window.removeEventListener("resize", resizeCanvases);
        window.visualViewport?.removeEventListener("resize", resizeCanvases);
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
      // canvasNode: يضمن إعادة التجميع لحظة إنشاء اللوحتين في الـ DOM
      // (عند فتح وضع الكتابة/وضع القراءة) قبل حدوث أي رسم.
    }, [resizeCanvases, canvasNode]);

    // Lock body scroll, reset viewport scroll, and initialize coordinate plane
    useEffect(() => {
      if (isActive) {
        panYRef.current = 0;
        setPanY(0);
        const prevOverflow = document.body.style.overflow;
        const prevTouchAction = document.body.style.touchAction;
        document.body.style.overflow = "hidden";
        document.body.style.touchAction = "none";
        window.scrollTo(0, 0);
        return () => {
          document.body.style.overflow = prevOverflow;
          document.body.style.touchAction = prevTouchAction;
        };
      }
    }, [isActive]);

    useEffect(() => {
      drawRuledLines(panYRef.current);
    }, [drawRuledLines, isPageRuled]);

    // Export current canvas as data URL on-demand
    const generateDataUrl = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return "";
      return canvas.toDataURL("image/png");
    }, []);

    // Save strokes state to parent without blocking the main UI thread with heavy base64 serialization
    const notifyChange = useCallback(
      (newStrokes: Stroke[], ruled: boolean) => {
        if (onStrokesChange) {
          onStrokesChange(newStrokes, ruled, "");

          if (dataUrlTimeoutRef.current) clearTimeout(dataUrlTimeoutRef.current);
          dataUrlTimeoutRef.current = setTimeout(() => {
            if (canvasRef.current && onStrokesChange) {
              const url = canvasRef.current.toDataURL("image/png");
              onStrokesChange(newStrokes, ruled, url);
            }
          }, 800);
        }
      },
      [onStrokesChange]
    );

    // Notify undo/redo availability to parent
    useEffect(() => {
      if (onUndoChange) {
        onUndoChange(historyIndex > 0, historyIndex < history.length - 1);
      }
    }, [historyIndex, history.length, onUndoChange]);

    // History push
    const recordHistory = (newStrokes: Stroke[]) => {
      const nextHistory = history.slice(0, historyIndex + 1);
      nextHistory.push(newStrokes);
      if (nextHistory.length > 50) nextHistory.shift();
      const newIdx = nextHistory.length - 1;
      lastInternalStrokesRef.current = newStrokes;
      setHistory(nextHistory);
      setHistoryIndex(newIdx);
      setStrokes(newStrokes);
      notifyChange(newStrokes, isPageRuled);
      if (onUndoChange) {
        onUndoChange(newIdx > 0, false);
      }
    };

    // Undo action
    const handleUndo = useCallback(() => {
      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        const previousStrokes = history[nextIndex];
        lastInternalStrokesRef.current = previousStrokes;
        strokesRef.current = previousStrokes;
        setStrokes(previousStrokes);
        redrawAll(previousStrokes, panYRef.current);
        notifyChange(previousStrokes, isPageRuled);
        if (onUndoChange) {
          onUndoChange(nextIndex > 0, nextIndex < history.length - 1);
        }
      }
    }, [history, historyIndex, redrawAll, notifyChange, isPageRuled, onUndoChange]);

    // Redo action
    const handleRedo = useCallback(() => {
      if (historyIndex < history.length - 1) {
        const nextIndex = historyIndex + 1;
        setHistoryIndex(nextIndex);
        const nextStrokes = history[nextIndex];
        lastInternalStrokesRef.current = nextStrokes;
        strokesRef.current = nextStrokes;
        setStrokes(nextStrokes);
        redrawAll(nextStrokes, panYRef.current);
        notifyChange(nextStrokes, isPageRuled);
        if (onUndoChange) {
          onUndoChange(nextIndex > 0, nextIndex < history.length - 1);
        }
      }
    }, [history, historyIndex, redrawAll, notifyChange, isPageRuled, onUndoChange]);

    // Keyboard shortcuts for Undo and Redo
    useEffect(() => {
      if (!isActive) return;
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
          if (e.key === "z" && !e.shiftKey) {
            e.preventDefault();
            handleUndo();
          } else if (e.key === "y" || (e.key === "z" && e.shiftKey) || (e.key === "Z" && e.shiftKey)) {
            e.preventDefault();
            handleRedo();
          }
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isActive, handleUndo, handleRedo]);

    // Clear all strokes
    const handleClearAll = useCallback(() => {
      recordHistory([]);
      strokesRef.current = [];
      redrawAll([], panYRef.current);
      strokeBoundsRef.current.clear();
      setActivePopup("none");
    }, [history, historyIndex, redrawAll, isPageRuled]);

    // Discard entire handwriting mode & clear all session data completely
    const handleDiscardAll = useCallback(() => {
      setStrokes([]);
      setHistory([[]]);
      setHistoryIndex(0);
      strokesRef.current = [];
      lastInternalStrokesRef.current = [];
      strokeBoundsRef.current.clear();
      redrawAll([], panYRef.current);
      setActivePopup("none");
      setIsCollapsed(false);
      if (onStrokesChange) {
        onStrokesChange([], false, "");
      }
      if (onUndoChange) {
        onUndoChange(false, false);
      }
      if (onDiscard) {
        onDiscard();
      } else {
        onClose();
      }
    }, [redrawAll, onStrokesChange, onUndoChange, onDiscard, onClose]);

    // Ultra-Fast 120fps Precision Partial Eraser (Apple Notes / GoodNotes style):
    // يمحو الجزء الذي يمرّ عليه القرص فقط ويقسّم الخط إلى المقزّم الباقية —
    // لا يحذف الخط كاملاً أبدًا. فرز AABB أولاً ثم رياضيات القصّ الدقيقة.
    const eraseAtPoint = (worldX: number, worldY: number, radius = 28) => {
      let didModify = false;
      const nextStrokes: Stroke[] = [];

      for (let s = 0; s < strokesRef.current.length; s++) {
        const stroke = strokesRef.current[s];
        const bounds = getStrokeBounds(stroke);
        const intersectsStroke = (
          worldX + radius >= bounds.minX &&
          worldX - radius <= bounds.maxX &&
          worldY + radius >= bounds.minY &&
          worldY - radius <= bounds.maxY
        );

        if (!intersectsStroke) {
          nextStrokes.push(stroke);
          continue;
        }

        const pieces = eraseStrokePortion(stroke, worldX, worldY, radius);

        if (pieces.length === 1 && pieces[0] === stroke) {
          // الحدود تلامس لكن الهندسة لم تُمس — نحتفظ بالمصدر وذاكرة حدوده
          nextStrokes.push(stroke);
          continue;
        }

        didModify = true;
        // الهندسة استُبدلت مقزّم جديدة بمعرّفات جديدة — تُحذف حدوده المخزّنة
        strokeBoundsRef.current.delete(stroke.id);
        for (let p = 0; p < pieces.length; p++) {
          nextStrokes.push(pieces[p]);
        }
      }

      if (didModify) {
        didEraseDuringDragRef.current = true;
        strokesRef.current = nextStrokes;
        scheduleRedraw();
      }
    };

    // Core Drawing Helpers (Operating in World Coordinates)
    const startDrawing = (clientX: number, clientY: number, pressure = 0.5) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      const worldX = clientX - rect.left;
      const worldY = clientY - rect.top + panYRef.current;

      isDrawingRef.current = true;
      didEraseDuringDragRef.current = false;

      const startPoint: StrokePoint = { x: worldX, y: worldY, pressure, time: performance.now() };
      currentPointsRef.current = [startPoint];
      lastPointRef.current = startPoint;

      if (activeToolRef.current === "eraser") {
        eraseAtPoint(worldX, worldY);
      } else {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.scale(dpr, dpr);
          ctx.translate(0, -panYRef.current);
          ctx.fillStyle = selectedColorRef.current || (theme.isDark ? "#FFFFFF" : "#121A1B");
          ctx.beginPath();
          ctx.arc(worldX, worldY, selectedThicknessRef.current / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    };

    const moveDrawing = (clientX: number, clientY: number, pressure = 0.5) => {
      if (!isDrawingRef.current || !isActive) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      const worldX = clientX - rect.left;
      const worldY = clientY - rect.top + panYRef.current;
      const point: StrokePoint = { x: worldX, y: worldY, pressure, time: performance.now() };

      if (activeToolRef.current === "eraser") {
        eraseAtPoint(worldX, worldY);
      } else {
        const prevPoint = lastPointRef.current;
        if (prevPoint) {
          const midX = (prevPoint.x + worldX) / 2;
          const midY = (prevPoint.y + worldY) / 2;
          const width = selectedThicknessRef.current;

          const ctx = canvas.getContext("2d");
          if (ctx) {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);
            ctx.translate(0, -panYRef.current);

            ctx.strokeStyle = selectedColorRef.current || (theme.isDark ? "#FFFFFF" : "#121A1B");
            ctx.lineWidth = width;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            ctx.beginPath();
            if (currentPointsRef.current.length <= 1) {
              ctx.moveTo(prevPoint.x, prevPoint.y);
              ctx.lineTo(midX, midY);
            } else {
              const pBefore = currentPointsRef.current[currentPointsRef.current.length - 2];
              const prevMidX = (pBefore.x + prevPoint.x) / 2;
              const prevMidY = (pBefore.y + prevPoint.y) / 2;
              ctx.moveTo(prevMidX, prevMidY);
              ctx.quadraticCurveTo(prevPoint.x, prevPoint.y, midX, midY);
            }
            ctx.stroke();
            ctx.restore();
          }
        }

        currentPointsRef.current.push(point);
        lastPointRef.current = point;
      }
    };

    const finishDrawing = () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      if (activeToolRef.current === "pen" && currentPointsRef.current.length > 0) {
        const newStroke: Stroke = {
          id: `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          color: selectedColorRef.current,
          width: selectedThicknessRef.current,
          points: [...currentPointsRef.current],
        };
        const updated = [...strokesRef.current, newStroke];
        strokesRef.current = updated;
        recordHistory(updated);
        redrawAll(updated, panYRef.current);
      } else if (activeToolRef.current === "eraser" && didEraseDuringDragRef.current) {
        didEraseDuringDragRef.current = false;
        recordHistory(strokesRef.current);
      }

      currentPointsRef.current = [];
      lastPointRef.current = null;
    };

    // Robust, zero-latency drawing event pipeline (Universal Touch & Pointer Architecture)
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      let isDrawing = false;
      let isPanning = false;
      let lastPanY = 0;

      // 1. Gesture Blocker: Prevents Android/iOS WebView from hijacking canvas touch as scroll or gesture navigation
      const blockTouchGesture = (e: TouchEvent) => {
        if (!isActive && !isReadingMode) return;
        if (e.cancelable) {
          e.preventDefault();
        }
      };

      // 2. Direct Pointer Down Handler (Supports Touch, S-Pen, Apple Pencil, Mouse)
      const handlePointerDown = (e: PointerEvent) => {
        if (!isActive && !isReadingMode) return;
        e.preventDefault();

        // Track active pointer
        activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

        if (isReadingMode) {
          isPanning = true;
          let sumY = 0;
          activePointersRef.current.forEach((p) => (sumY += p.clientY));
          lastPanY = sumY / activePointersRef.current.size;
          return;
        }

        if (activePointersRef.current.size >= 2) {
          isPanning = true;
          if (isDrawing) {
            isDrawing = false;
            isDrawingRef.current = false;
            currentPointsRef.current = [];
            lastPointRef.current = null;
            scheduleRedraw();
          }
          let sumY = 0;
          activePointersRef.current.forEach((p) => (sumY += p.clientY));
          lastPanY = sumY / activePointersRef.current.size;
          return;
        }

        // Single finger / stylus inking
        isPanning = false;
        isDrawing = true;
        const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
        startDrawing(e.clientX, e.clientY, pressure);
      };

      // 3. Window-Level Pointer Move Handler (Captures 100% of trajectory even during fast strokes)
      const handlePointerMove = (e: PointerEvent) => {
        if (!isActive && !isReadingMode) return;

        if (activePointersRef.current.has(e.pointerId)) {
          activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        }

        if (isReadingMode || isPanning || activePointersRef.current.size >= 2) {
          if (activePointersRef.current.size > 0) {
            let sumY = 0;
            activePointersRef.current.forEach((p) => (sumY += p.clientY));
            const currentAvgY = sumY / activePointersRef.current.size;
            const deltaY = currentAvgY - lastPanY;
            lastPanY = currentAvgY;

            const nextPanY = Math.max(0, panYRef.current - deltaY);
            if (Math.abs(nextPanY - panYRef.current) > 0.3) {
              panYRef.current = nextPanY;
              setPanY(nextPanY);
              scheduleRedraw();
              drawRuledLines(nextPanY);
            }
          }
          return;
        }

        if (isDrawing && isDrawingRef.current) {
          e.preventDefault();
          // High-rate coalesced event retrieval for ultra-smooth 120Hz display refresh
          if (typeof (e as any).getCoalescedEvents === "function") {
            const coalesced = (e as any).getCoalescedEvents();
            if (coalesced && coalesced.length > 0) {
              for (let i = 0; i < coalesced.length; i++) {
                const cEvent = coalesced[i];
                const pressure = cEvent.pressure && cEvent.pressure > 0 ? cEvent.pressure : 0.5;
                moveDrawing(cEvent.clientX, cEvent.clientY, pressure);
              }
              return;
            }
          }

          const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
          moveDrawing(e.clientX, e.clientY, pressure);
        }
      };

      // 4. Window-Level Pointer Up & Cancel Handler
      const handlePointerUp = (e: PointerEvent) => {
        activePointersRef.current.delete(e.pointerId);

        if (isReadingMode) {
          if (activePointersRef.current.size === 0) {
            isPanning = false;
          } else {
            let sumY = 0;
            activePointersRef.current.forEach((p) => (sumY += p.clientY));
            lastPanY = sumY / activePointersRef.current.size;
          }
          return;
        }

        if (!isActive) return;

        if (activePointersRef.current.size < 2) {
          isPanning = false;
        }

        if (activePointersRef.current.size === 0) {
          isPanning = false;
          if (isDrawing || isDrawingRef.current) {
            isDrawing = false;
            finishDrawing();
          }
        }
      };

      const handleWindowBlur = () => {
        activePointersRef.current.clear();
        isPanning = false;
        if (isDrawing || isDrawingRef.current) {
          isDrawing = false;
          finishDrawing();
        }
      };

      // Attach gesture blockers on canvas
      canvas.addEventListener("touchstart", blockTouchGesture, { passive: false });
      canvas.addEventListener("touchmove", blockTouchGesture, { passive: false });
      canvas.addEventListener("touchend", blockTouchGesture, { passive: false });
      canvas.addEventListener("touchcancel", blockTouchGesture, { passive: false });

      // Attach pointerdown on canvas
      canvas.addEventListener("pointerdown", handlePointerDown, { passive: false });

      // Attach move & up on WINDOW for 100% trajectory capture across the entire screen
      window.addEventListener("pointermove", handlePointerMove, { passive: false });
      window.addEventListener("pointerup", handlePointerUp, { passive: false });
      window.addEventListener("pointercancel", handlePointerUp, { passive: false });
      window.addEventListener("blur", handleWindowBlur);

      return () => {
        canvas.removeEventListener("touchstart", blockTouchGesture);
        canvas.removeEventListener("touchmove", blockTouchGesture);
        canvas.removeEventListener("touchend", blockTouchGesture);
        canvas.removeEventListener("touchcancel", blockTouchGesture);

        canvas.removeEventListener("pointerdown", handlePointerDown);

        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
        window.removeEventListener("blur", handleWindowBlur);
      };
    }, [isActive, isReadingMode, scheduleRedraw, drawRuledLines]);

    // Desktop Mouse Wheel & Trackpad Vertical Scroll
    const handleWheel = (e: React.WheelEvent) => {
      if (!isActive && !isReadingMode) return;
      const nextPanY = Math.max(0, panYRef.current + e.deltaY);
      if (nextPanY !== panYRef.current) {
        panYRef.current = nextPanY;
        setPanY(nextPanY);
        scheduleRedraw();
        drawRuledLines(nextPanY);
      }
    };

    // Imperative handle for parent
    useImperativeHandle(ref, () => ({
      getStrokes: () => strokesRef.current,
      getDataUrl: () => generateDataUrl(),
      clear: () => handleClearAll(),
      undo: () => handleUndo(),
      redo: () => handleRedo(),
      canUndo: () => historyIndex > 0,
      canRedo: () => historyIndex < history.length - 1,
    }));

    // Toggle popups
    const togglePopup = (popup: PopupType) => {
      setActivePopup((prev) => (prev === popup ? "none" : popup));
    };

    // Close popup when tapping background
    const closePopups = () => {
      setActivePopup("none");
    };

    // Dar Al Hikayat Theme Design Palette
    const barBg = theme.mode === "apple_dark" ? "#1C1C1E" : theme.glass;
    const barBorder = theme.mode === "apple_dark" ? "rgba(255, 255, 255, 0.08)" : theme.border;
    const barShadow = theme.shadow || "0 4px 30px rgba(0,0,0,0.4)";
    const itemHoverBg = theme.isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)";

    const shouldDisplay = isActive || (isReadingMode && strokes.length > 0);

    if (!shouldDisplay) {
      return null;
    }

    const handwritingBgStyle: React.CSSProperties = {
      backgroundColor: theme.mode === "apple_dark" ? "#000000" : (theme.bg || (theme.isDark ? "#111718" : "#F4F1EA")),
      color: theme.text,
    };

    const handwritingView = (
      <div
        className="fixed inset-0 pointer-events-auto transition-opacity duration-300"
        style={{
          ...handwritingBgStyle,
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          touchAction: "none",
          zIndex: isReadingMode ? 20 : 999999,
        }}
        onClick={(e) => {
          if ((e.target as HTMLElement)?.id === "handwriting-canvas-layer") {
            closePopups();
          }
        }}
      >
        {/* Layer 1: Ruled Lines Canvas (Background) */}
        <canvas
          ref={ruledCanvasRef}
          className="absolute inset-0 pointer-events-none w-full h-full"
          style={{
            display: isPageRuled ? "block" : "none",
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            zIndex: 1,
          }}
        />

        {/* Layer 2: Main Inking Canvas with Two-Finger Infinite Panning & Single-Finger Inking */}
        <canvas
          id="handwriting-canvas-layer"
          ref={assignCanvasRef}
          className={`absolute inset-0 w-full h-full ${
            isActive
              ? "cursor-crosshair"
              : isReadingMode
              ? "cursor-grab active:cursor-grabbing"
              : "pointer-events-none"
          }`}
          onWheel={handleWheel}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            touchAction: "none",
            zIndex: 2,
          }}
        />

        {/* Top Header Capsule Bar (Strictly matching Dar Al Hikayat Editor Header Design) */}
        {isActive && (
          <header
            className="fixed top-4 left-0 right-0 px-4 pointer-events-none flex justify-center items-center transition-all duration-300 ease-out"
            dir="rtl"
            style={{ zIndex: 9999999 }}
          >
            <div
              className="pointer-events-auto relative w-full max-w-sm sm:max-w-md md:max-w-lg h-12 p-1.5 rounded-full backdrop-blur-2xl border-[0.5px] flex justify-between items-center gap-1.5 shadow-2xl transition-all duration-300"
              style={{
                backgroundColor: theme.mode === "apple_dark" ? "#1C1C1E" : theme.glass,
                borderColor: theme.mode === "apple_dark" ? "rgba(255, 255, 255, 0.08)" : theme.border,
                boxShadow: theme.mode === "apple_dark"
                  ? "0 4px 30px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.6)"
                  : theme.shadow,
                borderRadius: "9999px",
              }}
            >
              {/* Right: Back Button + Story Title */}
              <div className="flex items-center gap-1 flex-1 min-w-0 pr-1 overflow-hidden">
                <button
                  onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer flex-shrink-0 apple-elastic-pinch"
                  style={{ color: theme.text }}
                  title="رجوع وحفظ"
                >
                  <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                </button>
                <div className="flex flex-col justify-center min-w-0 h-9 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0 max-w-full overflow-hidden w-full">
                    <h1
                      className="text-sm font-zain-bold truncate text-right leading-none min-w-0 flex-1 overflow-hidden whitespace-nowrap block select-none"
                      style={{ color: theme.text }}
                      title={title || "بدون عنوان"}
                    >
                      {title || "بدون عنوان"}
                    </h1>
                  </div>
                </div>
              </div>

              {/* Left: Undo, Redo, Divider, Save/Check */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={handleUndo}
                  disabled={historyIndex <= 0}
                  className={`w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all ${
                    historyIndex > 0 ? "cursor-pointer" : "cursor-not-allowed opacity-40"
                  }`}
                  style={{
                    color: historyIndex > 0 ? theme.text : theme.secondary,
                  }}
                  title="تراجع"
                >
                  <Undo2 className="w-4 h-4" />
                </button>

                <button
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  className={`w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all ${
                    historyIndex < history.length - 1 ? "cursor-pointer" : "cursor-not-allowed opacity-40"
                  }`}
                  style={{
                    color: historyIndex < history.length - 1 ? theme.text : theme.secondary,
                  }}
                  title="إعادة"
                >
                  <Redo2 className="w-4 h-4" />
                </button>

                <div
                  className="w-px h-5 mx-0.5"
                  style={{ backgroundColor: theme.border }}
                />

                <button
                  onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center rounded-full active:scale-95 transition-all cursor-pointer shadow-sm apple-elastic-pinch"
                  style={{
                    backgroundColor: theme.mode === "apple_dark" ? "#F5F5F5" : theme.accent,
                    color: theme.mode === "apple_dark" ? "#000000" : theme.bg,
                  }}
                  title="حفظ وإغلاق"
                >
                  <Check className="w-4 h-4" strokeWidth={2.8} />
                </button>
              </div>
            </div>
          </header>
        )}

        {/* Floating Bottom Bar & Collapsed Dome (Rendered strictly when isActive is true) */}
        {isActive && (
          <>
            {/* Collapsed Bottom Smooth Circular Arc Dome Button (Matching Screenshot_20260921_210841.jpg and Dar Al Hikayat Themes) */}
            <div
              className="fixed bottom-0 left-1/2 z-50 select-none pointer-events-none"
              style={{
                transform: isCollapsed ? "translateX(-50%) translateY(0%)" : "translateX(-50%) translateY(110%)",
                opacity: isCollapsed ? 1 : 0,
                pointerEvents: isCollapsed ? "auto" : "none",
                transition: "transform 420ms cubic-bezier(0.32, 0.72, 0, 1), opacity 300ms ease-out",
              }}
            >
              <button
                id="handwriting-btn-expand"
                onClick={() => setIsCollapsed(false)}
                className="flex flex-col items-center justify-center backdrop-blur-2xl border-t border-x cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95 group"
                style={{
                  width: "74px",
                  height: "32px",
                  borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
                  backgroundColor: barBg,
                  borderColor: barBorder,
                  color: theme.text,
                  boxShadow: barShadow,
                }}
                title="إظهار كبسولة الكتابة اليدوية"
              >
                <ChevronUp
                  className="w-4.5 h-4.5 transition-colors -mt-0.5 opacity-80 group-hover:opacity-100"
                  style={{ color: theme.text }}
                />
              </button>
            </div>

            {/* Main Floating Capsule Container (Smooth slide down/up with Apple physics) */}
            <div
              className="fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center justify-end pointer-events-none select-none pb-0"
              dir="ltr"
              style={{
                transform: isCollapsed ? "translateY(110%)" : "translateY(0%)",
                opacity: isCollapsed ? 0 : 1,
                pointerEvents: "none",
                transition: "transform 420ms cubic-bezier(0.32, 0.72, 0, 1), opacity 320ms ease-out",
              }}
            >
              {/* --- FLOATING CAPSULES ABOVE THE BAR (Matching Dar Al Hikayat Capsule Design) --- */}
              <div className={`relative w-full max-w-[340px] px-2 flex justify-center pb-2 ${activePopup !== "none" ? "pointer-events-auto" : "pointer-events-none"}`}>

                  {/* 1. Thickness Capsule (5 Noticeable Distinct Sizes) */}
                  {activePopup === "thickness" && (
                    <div
                      id="capsule-thickness"
                      className="absolute bottom-3 right-0 z-50 rounded-full py-2.5 px-3 flex items-center gap-2 shadow-2xl backdrop-blur-2xl border animate-in fade-in zoom-in-95 duration-200"
                      style={{
                        backgroundColor: barBg,
                        borderColor: barBorder,
                        boxShadow: barShadow,
                        borderRadius: "9999px",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {THICKNESS_PRESETS.map((preset) => {
                        const isSelected = selectedThickness === preset.value;
                        return (
                          <button
                            key={preset.value}
                            onClick={() => {
                              setSelectedThickness(preset.value);
                              selectedThicknessRef.current = preset.value;
                              setActiveTool("pen");
                              activeToolRef.current = "pen";
                            }}
                            className={`relative w-10 h-10 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer ${
                              isSelected
                                ? "scale-110 shadow-sm"
                                : "opacity-75 hover:opacity-100 hover:scale-105"
                            }`}
                            style={{
                              backgroundColor: isSelected ? `${theme.accent}25` : "transparent",
                              borderColor: isSelected ? theme.accent : "transparent",
                            }}
                            title={preset.label}
                          >
                            {/* Distinct Sized Nib Dots */}
                            <div
                              className="rounded-full transition-all"
                              style={{
                                width: `${preset.dotSize}px`,
                                height: `${preset.dotSize}px`,
                                backgroundColor: isSelected ? theme.accent : theme.text,
                              }}
                            />
                            {/* Calligraphic Indicator Stroke */}
                            <div
                              className="mt-1 rounded-full"
                              style={{
                                width: "16px",
                                height: `${Math.min(preset.svgWidth, 4.5)}px`,
                                backgroundColor: isSelected ? theme.accent : `${theme.text}60`,
                              }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 2. Color Capsule (Dar Al Hikayat Palette) */}
                  {activePopup === "color" && (
                    <div
                      id="capsule-color"
                      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50 rounded-full py-2.5 px-3.5 flex items-center gap-2.5 shadow-2xl backdrop-blur-2xl border animate-in fade-in zoom-in-95 duration-200"
                      style={{
                        backgroundColor: barBg,
                        borderColor: barBorder,
                        boxShadow: barShadow,
                        borderRadius: "9999px",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {COLOR_PALETTE.map((c) => {
                        const colorVal = theme.isDark ? c.hex : c.lightHex;
                        const isSelected = selectedColor.toLowerCase() === colorVal.toLowerCase();
                        return (
                          <button
                            key={c.hex}
                            onClick={() => {
                              setSelectedColor(colorVal);
                              selectedColorRef.current = colorVal;
                              setActiveTool("pen");
                              activeToolRef.current = "pen";
                              setActivePopup("none");
                            }}
                            className={`w-7 h-7 rounded-full transition-all cursor-pointer relative flex items-center justify-center ${
                              isSelected ? "scale-115 ring-2 ring-offset-2" : "hover:scale-110 opacity-90 hover:opacity-100"
                            }`}
                            style={{
                              backgroundColor: colorVal,
                              // @ts-ignore
                              "--tw-ring-color": theme.accent,
                              "--tw-ring-offset-color": theme.bg,
                            }}
                            title={c.name}
                          >
                            {c.hex === "#FFFFFF" && (
                              <div className="w-full h-full rounded-full border border-black/20" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 3. Page Ruling Options & Discard Capsule */}
                  {activePopup === "options" && (
                    <div
                      id="capsule-options"
                      className="absolute bottom-3 left-0 z-50 rounded-2xl py-2.5 px-3.5 flex flex-col gap-2.5 shadow-2xl backdrop-blur-2xl border animate-in fade-in zoom-in-95 duration-200 min-w-[190px]"
                      style={{
                        backgroundColor: barBg,
                        borderColor: barBorder,
                        boxShadow: barShadow,
                      }}
                      onClick={(e) => e.stopPropagation()}
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className="text-xs font-zain-bold tracking-wide select-none"
                          style={{ color: theme.text }}
                        >
                          تسطير الصفحة
                        </span>
                        <button
                          onClick={() => {
                            const nextVal = !isPageRuled;
                            setIsPageRuled(nextVal);
                            notifyChange(strokes, nextVal);
                          }}
                          className={`relative w-11 h-6 rounded-full transition-colors duration-200 p-0.5 cursor-pointer flex items-center ${
                            isPageRuled ? "bg-[#007AFF]" : "bg-neutral-600/60"
                          }`}
                          dir="ltr"
                        >
                          <div
                            className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
                              isPageRuled ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      <div className="w-full h-px" style={{ backgroundColor: theme.border }} />

                      <button
                        id="handwriting-btn-discard-mode"
                        onClick={handleDiscardAll}
                        className="w-full py-1.5 px-3 rounded-full bg-red-500/15 hover:bg-red-500/25 text-red-500 text-xs font-zain-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                        title="إلغاء الكتابة اليدوية وحذف التعديلات"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>إلغاء الكتابة اليدوية</span>
                      </button>
                    </div>
                  )}

                  {/* 4. Eraser Capsule (Clean options + Clear All) */}
                  {activePopup === "eraser" && (
                    <div
                      id="capsule-eraser"
                      className="absolute bottom-3 right-4 z-50 rounded-full py-2 px-3.5 flex items-center gap-2.5 shadow-2xl backdrop-blur-2xl border animate-in fade-in zoom-in-95 duration-200"
                      style={{
                        backgroundColor: barBg,
                        borderColor: barBorder,
                        boxShadow: barShadow,
                        borderRadius: "9999px",
                      }}
                      onClick={(e) => e.stopPropagation()}
                      dir="rtl"
                    >
                      <div className="flex items-center gap-1.5 px-1">
                        <EraserIcon className="w-4 h-4" style={{ color: theme.accent }} />
                        <span className="text-xs font-zain-bold select-none" style={{ color: theme.text }}>
                          مسح موضعي
                        </span>
                      </div>
                      <div className="w-px h-5 mx-0.5" style={{ backgroundColor: theme.border }} />
                      <button
                        onClick={handleClearAll}
                        className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-500/15 hover:bg-red-500/25 text-red-500 text-xs font-zain-bold transition-all cursor-pointer active:scale-95"
                        title="مسح كل الرسومات والخطوط"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>مسح الكل</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* --- MAIN BOTTOM BAR (COMPACT, BALANCED FLOATING CAPSULE) --- */}
                <div className="w-full flex justify-center pb-4 px-4 pointer-events-auto">
                  <div
                    className="inline-flex items-center justify-between gap-3 sm:gap-4.5 h-13 px-4 py-1.5 rounded-full backdrop-blur-2xl border-[0.5px] shadow-2xl transition-all duration-300 overflow-visible relative"
                    style={{
                      backgroundColor: barBg,
                      borderColor: barBorder,
                      boxShadow: barShadow,
                      borderRadius: "9999px",
                    }}
                  >
                    {/* Left Button 1: Chevron Down (Collapse to Bottom Dome Button) */}
                    <button
                      id="handwriting-btn-close"
                      onClick={() => {
                        setActivePopup("none");
                        setIsCollapsed(true);
                      }}
                      className="w-8.5 h-8.5 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer flex-shrink-0"
                      style={{ color: theme.text }}
                      title="طي كبسولة الأدوات"
                    >
                      <ChevronDown className="w-4.5 h-4.5" />
                    </button>

                {/* Left Button 2: More Options (...) for Page Ruling */}
                <button
                  id="handwriting-btn-options"
                  onClick={() => togglePopup("options")}
                  className={`w-8.5 h-8.5 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 flex-shrink-0 ${
                    activePopup === "options"
                      ? "shadow-inner"
                      : "hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                  style={{
                    backgroundColor: activePopup === "options" ? `${theme.accent}25` : undefined,
                    color: activePopup === "options" ? theme.accent : theme.text,
                  }}
                  title="خيارات تسطير الصفحة"
                >
                  <MoreHorizontal className="w-4.5 h-4.5" />
                </button>

                {/* Center: Rainbow Color Ring Button */}
                <div className="flex justify-center items-center px-1">
                  <button
                    id="handwriting-btn-color"
                    onClick={() => togglePopup("color")}
                    className="relative w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer p-0.5 shadow-sm"
                    style={{
                      background: "conic-gradient(from 0deg, #ff0000, #ff8800, #ffff00, #00ff00, #00ffff, #0000ff, #8800ff, #ff0088, #ff0000)",
                    }}
                    title="لوحة الألوان"
                  >
                    {/* Inner Preview Circle */}
                    <div
                      className="w-5.5 h-5.5 rounded-full border border-black/20 dark:border-white/20 shadow-inner transition-colors"
                      style={{ backgroundColor: selectedColor }}
                    />
                  </button>
                </div>

                {/* Right Tool 1: Realistic Eraser Stick (Huawei Notes Inspired) */}
                <button
                  id="handwriting-btn-eraser"
                  onClick={() => {
                    setActiveTool("eraser");
                    activeToolRef.current = "eraser";
                    togglePopup("eraser");
                  }}
                  className={`relative flex flex-col items-center justify-end w-10 h-10 transition-all duration-300 ease-out cursor-pointer overflow-visible ${
                    activeTool === "eraser"
                      ? "-translate-y-7 scale-110 z-20"
                      : "translate-y-0 opacity-75 hover:opacity-100 hover:-translate-y-1.5 z-10"
                  }`}
                  title="الممحاة (مسح تدريجي موضعي)"
                >
                  <div className="relative flex items-center justify-center overflow-visible">
                    <svg
                      className="w-6 h-12 overflow-visible drop-shadow-md"
                      viewBox="0 0 24 50"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <defs>
                        <linearGradient id="eraserRubberGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#FFFFFF" />
                          <stop offset="25%" stopColor="#FFFFFF" />
                          <stop offset="70%" stopColor="#ECEFF2" />
                          <stop offset="100%" stopColor="#D5DAE0" />
                        </linearGradient>
                        <linearGradient id="eraserHighlight" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
                          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="eraserBarrelGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#9AA0A7" />
                          <stop offset="22%" stopColor="#BDC3C9" />
                          <stop offset="42%" stopColor="#E6E9ED" />
                          <stop offset="65%" stopColor="#A4ABB2" />
                          <stop offset="100%" stopColor="#7F858C" />
                        </linearGradient>
                        <linearGradient id="eraserSeamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#7B8188" />
                          <stop offset="40%" stopColor="#D5DAE0" />
                          <stop offset="100%" stopColor="#676D74" />
                        </linearGradient>
                      </defs>

                      {/* White Rubber Dome Cap */}
                      <path
                        d="M 3 20 L 3 9 C 3 3.5 7.5 1.5 12 1.5 C 16.5 1.5 21 3.5 21 9 L 21 20 Z"
                        fill="url(#eraserRubberGrad)"
                      />
                      {/* Left vertical soft highlight on rubber */}
                      <path
                        d="M 4.5 20 L 4.5 9 C 4.5 4.5 7.5 2.5 10 2 L 10 20 Z"
                        fill="url(#eraserHighlight)"
                        opacity="0.65"
                      />

                      {/* Ferrule Seam Ring */}
                      <rect x="3" y="19.5" width="18" height="1.2" fill="url(#eraserSeamGrad)" />

                      {/* Metallic Textured Sleeve / Barrel with Rounded Base */}
                      <rect
                        x="3"
                        y="20.7"
                        width="18"
                        height="27.3"
                        rx="2.5"
                        fill="url(#eraserBarrelGrad)"
                      />
                      {/* Specular vertical light reflection streak down the barrel */}
                      <rect
                        x="5.5"
                        y="20.7"
                        width="2.5"
                        height="25"
                        fill="#FFFFFF"
                        opacity="0.4"
                      />
                    </svg>
                  </div>
                  {activeTool === "eraser" && (
                    <span
                      className="w-1.5 h-1.5 rounded-full absolute -bottom-2 shadow-sm transition-all"
                      style={{ backgroundColor: theme.accent }}
                    />
                  )}
                </button>

                {/* Right Tool 2: Realistic Fountain Pen (Huawei Notes Inspired) */}
                <button
                  id="handwriting-btn-pen"
                  onClick={() => {
                    setActiveTool("pen");
                    activeToolRef.current = "pen";
                    togglePopup("thickness");
                  }}
                  className={`relative flex flex-col items-center justify-end w-10 h-10 transition-all duration-300 ease-out cursor-pointer overflow-visible ${
                    activeTool === "pen"
                      ? "-translate-y-7 scale-110 z-20"
                      : "translate-y-0 opacity-75 hover:opacity-100 hover:-translate-y-1.5 z-10"
                  }`}
                  title="ريشة القلم الحبر وسماكة الخط"
                >
                  <div className="relative flex items-center justify-center overflow-visible">
                    <svg
                      className="w-7 h-14 overflow-visible drop-shadow-md"
                      viewBox="0 0 28 58"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <defs>
                        <linearGradient id="nibLeftBevel" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#DFE3E7" />
                          <stop offset="35%" stopColor="#FFFFFF" />
                          <stop offset="85%" stopColor="#F5F7F9" />
                          <stop offset="100%" stopColor="#CBD0D6" />
                        </linearGradient>
                        <linearGradient id="nibRightBevel" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#B3B8BF" />
                          <stop offset="45%" stopColor="#CBD0D6" />
                          <stop offset="80%" stopColor="#9AA0A7" />
                          <stop offset="100%" stopColor="#7E848B" />
                        </linearGradient>
                        <linearGradient id="penCollarGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#7A8087" />
                          <stop offset="35%" stopColor="#FFFFFF" />
                          <stop offset="70%" stopColor="#C4C9CF" />
                          <stop offset="100%" stopColor="#636970" />
                        </linearGradient>
                        <linearGradient id="penBarrelGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#C4C8CE" />
                          <stop offset="28%" stopColor="#F6F8FA" />
                          <stop offset="68%" stopColor="#E9ECEF" />
                          <stop offset="100%" stopColor="#A8AEB6" />
                        </linearGradient>
                      </defs>

                      {/* --- FOUNTAIN PEN NIB --- */}
                      {/* Left Half / Bevel of Nib */}
                      <path
                        d="M 14 1.5 L 5.5 19.5 C 4.5 21.5 5.5 24 6.5 26.5 L 14 26.5 Z"
                        fill="url(#nibLeftBevel)"
                      />
                      {/* Right Half / Bevel of Nib */}
                      <path
                        d="M 14 1.5 L 22.5 19.5 C 23.5 21.5 22.5 24 21.5 26.5 L 14 26.5 Z"
                        fill="url(#nibRightBevel)"
                      />

                      {/* Center Slit Line */}
                      <line x1="14" y1="1.5" x2="14" y2="17.5" stroke="#3D4248" strokeWidth="0.8" />
                      {/* Breather Hole */}
                      <circle cx="14" cy="17.5" r="1.3" fill="#24282D" />

                      {/* Collar Ring */}
                      <path
                        d="M 6 26.5 C 6 25.5 22 25.5 22 26.5 L 22.5 29.5 C 22.5 30.5 5.5 30.5 5.5 29.5 Z"
                        fill="url(#penCollarGrad)"
                        stroke="#60666D"
                        strokeWidth="0.4"
                      />

                      {/* Pen Barrel Body (Tapering downwards with smooth rounded base) */}
                      <path
                        d="M 6 29.5 C 5.2 38 4.6 46.5 4 54 C 4 56.5 5.5 58 8 58 L 20 58 C 22.5 58 24 56.5 24 54 C 23.4 46.5 22.8 38 22 29.5 Z"
                        fill="url(#penBarrelGrad)"
                      />
                      {/* Left vertical subtle sheen highlight on pen barrel */}
                      <path
                        d="M 8 29.5 C 7.2 38 6.6 46.5 6 56 L 8.5 56 C 9.1 46.5 9.8 38 10.5 29.5 Z"
                        fill="#FFFFFF"
                        opacity="0.38"
                      />
                    </svg>
                  </div>
                  {activeTool === "pen" && (
                    <span
                      className="w-1.5 h-1.5 rounded-full absolute -bottom-2 shadow-sm transition-all"
                      style={{ backgroundColor: theme.accent }}
                    />
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(handwritingView, document.body);
  }
  return handwritingView;
  }
);

DarAlHikayatHandwriting.displayName = "DarAlHikayatHandwriting";
export default DarAlHikayatHandwriting;

