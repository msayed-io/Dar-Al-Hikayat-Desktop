import type { Stroke } from "../components/DarAlHikayatHandwriting";

export type HandwritingSaveResult = "saved" | "empty" | "failed" | "busy";

/** Ink vectors, never the length of a PNG, determine whether a canvas is empty. */
export function hasHandwritingInk(strokes: readonly Stroke[] | undefined): boolean {
  return Boolean(strokes?.some((stroke) =>
    stroke.points?.some((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  ));
}

export interface HandwritingPreviewStroke {
  id: string;
  color: string;
  width: number;
  path?: string;
  dot?: { x: number; y: number };
}

export interface HandwritingPreviewGeometry {
  viewBox: string;
  top: number;
  height: number;
  strokes: HandwritingPreviewStroke[];
}

/**
 * Crop from the first visible ink at the TOP of the document, not the viewport
 * at save time. Tall pages never shrink into an unreadable full-page thumbnail.
 * This is only used by home cards; it does not participate in the inking loop.
 */
export function getHandwritingPreview(strokes: readonly Stroke[]): HandwritingPreviewGeometry | null {
  const bounds = strokes.map((stroke) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const width = Number.isFinite(stroke.width) && stroke.width > 0 ? stroke.width : 3.5;
    for (const point of stroke.points || []) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      minX = Math.min(minX, point.x - width / 2);
      maxX = Math.max(maxX, point.x + width / 2);
      minY = Math.min(minY, point.y - width / 2);
      maxY = Math.max(maxY, point.y + width / 2);
    }
    return { stroke, width, minX, maxX, minY, maxY };
  }).filter((b) => Number.isFinite(b.minY));
  if (bounds.length === 0) return null;

  const padding = 8;
  const height = 144;
  const top = bounds.reduce((y, b) => Math.min(y, b.minY), Infinity) - padding;
  const visible = bounds.filter((b) => b.minY <= top + height && b.maxY >= top);
  const left = visible.reduce((x, b) => Math.min(x, b.minX), Infinity) - padding;
  const right = visible.reduce((x, b) => Math.max(x, b.maxX), -Infinity) + padding;
  const width = Math.max(240, right - left);
  const x = left - (width - (right - left)) / 2;

  return {
    viewBox: `${x} ${top} ${width} ${height}`,
    top,
    height,
    strokes: visible.map(({ stroke, width }) => {
      const points = stroke.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      const first = points[0];
      if (points.length === 1) {
        return { id: stroke.id, color: stroke.color, width, dot: { x: first.x, y: first.y } };
      }
      // Match the canvas's quadratic smoothing and round ends; do not change ink.
      const parts = [`M ${first.x} ${first.y}`];
      for (let i = 1; i < points.length; i++) {
        const previous = points[i - 1];
        const point = points[i];
        parts.push(`Q ${previous.x} ${previous.y} ${(previous.x + point.x) / 2} ${(previous.y + point.y) / 2}`);
      }
      const last = points[points.length - 1];
      parts.push(`L ${last.x} ${last.y}`);
      return { id: stroke.id, color: stroke.color, width, path: parts.join(" ") };
    }),
  };
}
