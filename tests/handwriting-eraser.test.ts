/**
 * اختبارات الممحاة المسح الجزئي (Partial Eraser) — الدقة الاحترافية.
 *
 * تثبت أن الممحاة:
 *  - لا تحذف الخط كاملاً أبدًا (المشكلة السابقة: المسح الموضعي كان يمسح كل شيء).
 *  - تمحو ما تحت القرص فقط وتقصّ الأطراف عند حدوده بدقّة رياضية.
 *  - تقسم الخط المقطوع إلى خطوط مستقلة تحتفظ باللون والسماكة.
 *  - لا تلمس الخطوط البعيدة (هوية الكائن نفسه — صفر إعادة رسم).
 */
import { describe, it, expect } from "vitest";
import { eraseStrokePortion } from "../lib/handwriting-eraser";
import type { Stroke, StrokePoint } from "../components/DarAlHikayatHandwriting";

const pts = (coords: Array<[number, number]>): StrokePoint[] =>
  coords.map(([x, y], i) => ({ x, y, pressure: 0.5, time: i * 16 }));

const mkStroke = (points: StrokePoint[], over: Partial<Stroke> = {}): Stroke => ({
  id: "stroke_A",
  color: "#121A1B",
  width: 3.5,
  points,
  ...over,
});

const distTo = (p: StrokePoint, ex: number, ey: number) =>
  Math.sqrt((p.x - ex) ** 2 + (p.y - ey) ** 2);

describe("eraseStrokePortion — المسح الجزئي الدقيق", () => {
  it("خط بعيد عن القرص: يرجع الكائن نفسه (هوية) ولا يمسّ شيئًا", () => {
    const stroke = mkStroke(pts([[-100, 200], [0, 200], [100, 200]]));
    const result = eraseStrokePortion(stroke, 0, 0, 28);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(stroke);
  });

  it("تقاطع ضلع طويل مع القرص (نقطتان خارجيتين): ينقّص إلى قطعتين عند حدود الدائرة", () => {
    const stroke = mkStroke(pts([[-100, 0], [100, 0]]));
    const result = eraseStrokePortion(stroke, 0, 0, 28);

    expect(result).toHaveLength(2);
    const [left, right] = result;

    // كل النقاط الباقية خارج القرص (أو على حدّه بالضبط)
    for (const f of result) {
      for (const p of f.points) {
        expect(distTo(p, 0, 0)).toBeGreaterThanOrEqual(28 - 1e-6);
      }
    }

    // القصّ تم عند حدود الدائرة بدل فجوة عشوائية
    expect(left.points[left.points.length - 1].x).toBeCloseTo(-28, 5);
    expect(right.points[0].x).toBeCloseTo(28, 5);

    // ترتيب وأطراف الخط الأصلية محفوظة
    expect(left.points[0].x).toBe(-100);
    expect(right.points[right.points.length - 1].x).toBe(100);
  });

  it("جزء من خط طويل داخل القرص فقط: يمسحه ويترك باقي الخط كمقزّم مستقلة", () => {
    const line: Array<[number, number]> = [];
    for (let x = -100; x <= 100; x += 10) line.push([x, 0]);
    const stroke = mkStroke(pts(line));
    const result = eraseStrokePortion(stroke, 0, 0, 28);

    expect(result.length).toBe(2);

    // اللون والسماكة محفوظة في المقزّم كلها + معرّفات جديدة فريدة
    const ids = new Set<string>();
    for (const frag of result) {
      expect(frag.color).toBe(stroke.color);
      expect(frag.width).toBe(stroke.width);
      expect(frag.id).not.toBe(stroke.id);
      expect(ids.has(frag.id)).toBe(false);
      ids.add(frag.id);
      // لا توجد نقطة متبقية داخل القرص
      for (const p of frag.points) {
        expect(distTo(p, 0, 0)).toBeGreaterThanOrEqual(28 - 1e-6);
      }
      // كل قطعة فعلًا خط صالح (نقطتان فأكثر وبطول ملموس)
      expect(frag.points.length).toBeGreaterThanOrEqual(2);
    }

    // المقزّم اليسرى تبدأ من رأس الخط الأصلية واليمنى تنتهي من ذيله
    expect(result[0].points[0].x).toBe(-100);
    expect(result[1].points[result[1].points.length - 1].x).toBe(100);
  });

  it("خط مغطى بالكامل بالقرص: يُحذف بالكامل (لا شيء باقٍ)", () => {
    const stroke = mkStroke(pts([[-5, 0], [0, 5], [5, -5], [0, 0]]));
    const result = eraseStrokePortion(stroke, 0, 0, 28);
    expect(result).toHaveLength(0);
  });

  it("نقطة مفردة: داخل القرص = محذوفة، خارجه = محفوظة كما هي (هوية)", () => {
    const inside = mkStroke(pts([[3, 4]]));
    expect(eraseStrokePortion(inside, 0, 0, 28)).toHaveLength(0);

    const outside = mkStroke(pts([[100, 100]]));
    const res = eraseStrokePortion(outside, 0, 0, 28);
    expect(res).toHaveLength(1);
    expect(res[0]).toBe(outside);
  });

  it("ضلع يقترب من القرص دون لمسه: هوية بدون تغيير (لا انزلاق في الحدود)", () => {
    // خط قطرى y=x والقرص عند (50,-50): أقرب مسافة ≈ 70.7 > 28
    const stroke = mkStroke(pts([[-100, -100], [0, 0], [100, 100]]));
    const result = eraseStrokePortion(stroke, 50, -50, 28);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(stroke);
  });

  it("شظايا القطع الدقيقة تُقصّ ولا تترك حبيبات (قاعدة max(6px, 1.8×السماكة))", () => {
    // نتوء صغير عند x≈28-30 فقط بعد المسح: بقايا مقزّم واحدة شحيحة
    const stroke = mkStroke(pts([[0, 0], [30, 0], [0, 0]]));
    const result = eraseStrokePortion(stroke, 0, 0, 28);
    expect(result).toHaveLength(0);
  });

  it("أطراف القصّ تحتفظ ببيانات النقطة (pressure/time) من الموضع المُقصّ", () => {
    const stroke = mkStroke(pts([[-100, 0], [100, 0]]));
    const result = eraseStrokePortion(stroke, 0, 0, 28);
    const exitPoint = result[0].points[result[0].points.length - 1];
    expect(exitPoint.pressure).toBeGreaterThanOrEqual(0);
    expect(exitPoint.pressure).toBeLessThanOrEqual(1);
    expect(Number.isFinite(exitPoint.time)).toBe(true);
  });

  it("عدة خطوط متقاربة: كل خط يُعالَج باستقلالية (البعيد هوية، القريب مقسوم)", () => {
    const near = mkStroke(pts([[-50, 0], [50, 0]]), { id: "near" });
    const far = mkStroke(pts([[-50, 300], [50, 300]]), { id: "far" });

    const nearResult = eraseStrokePortion(near, 0, 0, 28);
    const farResult = eraseStrokePortion(far, 0, 0, 28);

    expect(nearResult.length).toBe(2);
    expect(farResult[0]).toBe(far);
  });
});
