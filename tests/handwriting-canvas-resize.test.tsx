/**
 * @vitest-environment jsdom
 *
 * اختبار جذر مشكلة "الخطوط العملاقة والضبابية البعيدة عن الإصبع" (v1.0.102–104).
 *
 * السبب الجذري المُثبت:
 *   المكوّن يعيد `null` وهو غير نشط، فتنشأ اللوحتان (canvas) لحظة تفعيل وضع
 *   الكتابة اليدوية فقط. أما تغيير حجم المخزن المؤقت (canvas.width/height)
 *   فلا يحدث إلا داخل `useLayoutEffect` المربوط بـ `[resizeCanvases]`، وهي
 *   مرجعية لا تتغير عند التفعيل — فيبقى المخزن بمقاس HTML الافتراضي 300×150
 *   والـ CSS تمدّه على كامل الشاشة، فتضخم الخطوط ~11 مرة رأسياً وتبتعد عن
 *   الإصبع وتظهر ضبابية من التكبير.
 *
 * هذا الاختبار يفشل على الكود المصاب (300×150) وينجح بعد إصلاح الجذر.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react";
import DarAlHikayatHandwriting, { Stroke } from "../components/DarAlHikayatHandwriting";
import { ThemeColors } from "../contexts/AppContext";

const theme: ThemeColors = {
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

// Prop ثابت الهوية (مثل التطبيق الفعلي) — مصفوفة افتراضية جديدة في كل رندر
// ستؤدي لحلقة لا نهائية في useEffect المزامن، لذا نمرر مراجع ثابتة دائماً.
const EMPTY_STROKES: Stroke[] = [];
const sampleStrokes: Stroke[] = [
  {
    id: "s_test_1",
    color: "#121A1B",
    width: 3.5,
    points: [
      { x: 40, y: 60, pressure: 0.5, time: 0 },
      { x: 80, y: 120, pressure: 0.5, time: 16 },
    ],
  },
];

let root: Root | null = null;
let host: HTMLElement;

const expectedDpr = () => Math.min(window.devicePixelRatio || 1, 2);
const expectedWidth = () => Math.round((window.innerWidth || 1024) * expectedDpr());
const expectedHeight = () => Math.round((window.innerHeight || 768) * expectedDpr());

function render(props: Partial<React.ComponentProps<typeof DarAlHikayatHandwriting>> = {}) {
  if (!root) root = createRoot(host);
  act(() => {
    root!.render(
      <DarAlHikayatHandwriting
        isActive={false}
        onClose={() => {}}
        theme={theme}
        title="اختبار"
        initialStrokes={EMPTY_STROKES}
        {...props}
      />
    );
  });
}

function getCanvas(): HTMLCanvasElement | null {
  return document.getElementById("handwriting-canvas-layer") as HTMLCanvasElement | null;
}

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);

  // محاكاة بيئة WebView: لا نحتاج رسم فعلي — يكفي قياس أبعاد المخزن المؤقت
  const noopCtx: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "measureText") return () => ({ width: 0 });
        if (prop === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
        return () => undefined;
      },
      set: () => true,
      has: () => true,
    }
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(noopCtx);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,");
  Object.defineProperty(window, "scrollTo", { value: vi.fn(), configurable: true });
});

afterAll(() => {
  act(() => {
    root?.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
});

describe("Handwriting canvas buffer sizing (root cause of giant displaced strokes)", () => {
  it("المكوّن غير النشط لا يعرض أي لوحة رسم", () => {
    render({ isActive: false });
    expect(getCanvas()).toBeNull();
  });

  it("عند فتح وضع الكتابة اليدوية يجب أن يُجمّع المخزن المؤقت بمقاس الشاشة الكامل فوراً (قبل أول رسمة)", () => {
    // نفس مسار التفعيل في التطبيق: نفس المكوّن المركّب مسبقاً يتحول إلى isActive=true
    render({ isActive: true });

    const canvas = getCanvas();
    expect(canvas).not.toBeNull();

    // هذا هو دليل الجذر: إن بقي 300×150 فالخطوط ستظهر عملاقة/ضبابية/متباعدة
    expect(canvas!.width).toBe(expectedWidth());
    expect(canvas!.height).toBe(expectedHeight());
    expect(canvas!.width).toBeGreaterThan(300);
    expect(canvas!.height).toBeGreaterThan(150);
  });

  it("إغلاق ثم إعادة الفتح تعيد تجميع المخزن مرة أخرى", () => {
    render({ isActive: false });
    expect(getCanvas()).toBeNull();

    render({ isActive: true });
    const canvas = getCanvas();
    expect(canvas).not.toBeNull();
    expect(canvas!.width).toBe(expectedWidth());
    expect(canvas!.height).toBe(expectedHeight());
  });

  it("وضع القراءة (المعاينة المحفوظة) يجمّع المخزن بالمقاس الصحيح أيضاً", () => {
    render({ isActive: false, isReadingMode: true, initialStrokes: sampleStrokes });

    const canvas = getCanvas();
    expect(canvas).not.toBeNull();
    expect(canvas!.width).toBe(expectedWidth());
    expect(canvas!.height).toBe(expectedHeight());
  });
});
