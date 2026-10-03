/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HandwritingPreview } from "../components/HandwritingPreview";
import { getHandwritingPreview, hasHandwritingInk } from "../lib/handwriting-document";
import type { Stroke } from "../components/DarAlHikayatHandwriting";
import { sampleStrokes, theme } from "./helpers/handwriting-dom";

function stroke(id: string, y: number, x = 100): Stroke {
  return { id, color: "#3B82F6", width: 7, points: [
    { x, y, pressure: .2, time: 1 }, { x: x + 120, y: y + 40, pressure: .8, time: 2 },
  ] };
}

describe("Top-of-ink home card preview", () => {
  it("recognizes actual ink, including a single dot, not empty stroke records", () => {
    expect(hasHandwritingInk([])).toBe(false);
    expect(hasHandwritingInk([{ ...sampleStrokes[0], points: [] }])).toBe(false);
    expect(hasHandwritingInk([{ ...sampleStrokes[0], points: [sampleStrokes[0].points[0]] }])).toBe(true);
    expect(getHandwritingPreview([])).toBeNull();
  });

  it("crops the top portion, not the whole tall drawing", () => {
    const result = getHandwritingPreview([stroke("top", 500), stroke("bottom", 6000)])!;
    expect(result.top).toBeCloseTo(500 - 3.5 - 8);
    expect(result.height).toBe(144);
    expect(result.strokes.map((s) => s.id)).toEqual(["top"]);
  });

  it("finds top ink even if it was drawn after the first 35 strokes", () => {
    const input = [...Array.from({ length: 50 }, (_, i) => stroke(`below-${i}`, 4000 + 100 * i)), stroke("first-visible", 200)];
    expect(getHandwritingPreview(input)?.strokes.map((s) => s.id)).toEqual(["first-visible"]);
  });

  it("far-down first ink is not hidden by a blank page margin", () => {
    const result = getHandwritingPreview([stroke("far", 9000)])!;
    expect(result.top).toBeGreaterThan(8980);
    expect(result.top).toBeLessThan(9000);
    expect(result.strokes).toHaveLength(1);
  });

  it("preserves quadratic smoothing, width, colors and original points", () => {
    const strokes = [stroke("colored", 200)];
    const before = JSON.stringify(strokes);
    const result = getHandwritingPreview(strokes)!;
    expect(result.strokes[0]).toMatchObject({ color: "#3B82F6", width: 7, path: "M 100 200 Q 100 200 160 220 L 220 240" });
    expect(JSON.stringify(strokes)).toBe(before);
  });

  it("renders one-point marks as visible circles instead of invisible M-only paths", () => {
    const single = { ...sampleStrokes[0], points: [sampleStrokes[0].points[0]] };
    const markup = renderToStaticMarkup(<HandwritingPreview strokes={[single]} theme={theme} />);
    expect(markup).toContain("<circle");
    expect(markup).toContain('r="1.75"');
  });

  it("prefers vectors over old raster captures of a different pan position", () => {
    const markup = renderToStaticMarkup(<HandwritingPreview strokes={sampleStrokes} dataUrl="data:image/png;base64,OLD_VIEWPORT" theme={theme} />);
    expect(markup).toContain("<svg");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("OLD_VIEWPORT");
    expect(markup).toContain('preserveAspectRatio="xMidYMin slice"');
  });

  it("can preview legacy image-only notes and omits completely empty ones", () => {
    expect(renderToStaticMarkup(<HandwritingPreview dataUrl="data:image/png;base64,LEGACY" theme={theme} />)).toContain("<img");
    expect(renderToStaticMarkup(<HandwritingPreview strokes={[]} theme={theme} />)).toBe("");
  });

  it("does not emit NaN or infinite SVG coordinates from malformed imported points", () => {
    const malformed = [{ ...sampleStrokes[0], points: [{ x: NaN, y: Infinity, pressure: .5, time: 0 }] }];
    expect(getHandwritingPreview(malformed)).toBeNull();
  });

  it("neutral ink remains legible when the home theme changes", () => {
    const white = [{ ...sampleStrokes[0], color: "#FFFFFF" }];
    const markup = renderToStaticMarkup(<HandwritingPreview strokes={white} theme={theme} />);
    expect(markup).toContain('stroke="#121A1B"');
  });
});
