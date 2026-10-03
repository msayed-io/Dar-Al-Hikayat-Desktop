import React, { memo, useMemo } from "react";
import type { Stroke } from "./DarAlHikayatHandwriting";
import type { ThemeColors } from "../contexts/AppContext";
import { getHandwritingPreview } from "../lib/handwriting-document";

const EMPTY_STROKES: Stroke[] = [];

/** A bounded top-of-ink preview. No canvas snapshots, timers or storage writes. */
export const HandwritingPreview = memo(function HandwritingPreview({
  strokes = EMPTY_STROKES,
  dataUrl,
  theme,
  grid = false,
}: {
  strokes?: Stroke[];
  dataUrl?: string;
  theme: ThemeColors;
  grid?: boolean;
}) {
  const geometry = useMemo(() => getHandwritingPreview(strokes), [strokes]);
  // Compatibility for imported legacy image-only notes. Vectors always win.
  const legacyImage = !geometry && !strokes.length && dataUrl?.startsWith("data:image/");
  if (!geometry && !legacyImage) return null;

  const previewColor = (ink: string) => {
    // Default neutral ink remains legible if the app theme changes later.
    const neutral = ["#ffffff", "#fff", "#121a1b", "#000000", "#000"];
    return neutral.includes(ink.toLowerCase()) ? theme.text : ink;
  };

  return (
    <div
      className={`w-full ${grid ? "h-16" : "h-14"} mb-3 rounded-xl overflow-hidden pointer-events-none select-none`}
      data-handwriting-preview="top"
      style={{
        backgroundColor: theme.bg,
        maskImage: "linear-gradient(to bottom, #000 80%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, #000 80%, transparent 100%)",
      }}
    >
      {geometry ? (
        <svg
          viewBox={geometry.viewBox}
          className="w-full h-full"
          preserveAspectRatio="xMidYMin slice"
          role="img"
          aria-label="معاينة بداية الكتابة اليدوية"
        >
          {geometry.strokes.map((stroke, index) => stroke.dot ? (
            <circle
              key={`${stroke.id}-${index}`}
              cx={stroke.dot.x}
              cy={stroke.dot.y}
              r={stroke.width / 2}
              fill={previewColor(stroke.color || theme.text)}
            />
          ) : (
            <path
              key={`${stroke.id}-${index}`}
              d={stroke.path}
              stroke={previewColor(stroke.color || theme.text)}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </svg>
      ) : (
        <img
          src={dataUrl}
          alt="معاينة بداية الكتابة اليدوية"
          className="w-full h-full object-cover object-top"
          loading="lazy"
        />
      )}
    </div>
  );
});
