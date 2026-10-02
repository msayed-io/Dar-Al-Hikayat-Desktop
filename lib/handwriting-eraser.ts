/**
 * المسح الجزئي الدقيق (Precision / Partial Eraser)
 *
 * مطابق لسلوك الممحات الاحترافية في تطبيقات الموبايل:
 *  - Apple Notes "Pixel Eraser": يحذف ما تحت القرص فقط ويبقى باقي الخط.
 *  - GoodNotes "Precision Eraser": "Removes only the content inside the erasing circle".
 *  - Notability "Partial Eraser": يحذف المقاطع الملامسة ويترك الباقي مقاطع مستقلة.
 *
 * الخوارزمية (_vector path trimming — لا كتم بالبكسل، لا أقنعة بيضاء):
 *  1. اختبار القطع على SEGMENTS لا على النقاط فقط (توصية tldraw: "erase the line,
 *     not the point" — تمنع الناجيات الغامضة عند الحركة السريعة).
 *  2. تقاطع دائرة المسح مع كل ضلع عبر معادلة تربيعية، وقصّ الأطراف عند حدود
 *     الدائرة (نقاط دخول/خروج) فلا يبقى فجوة ولا امتداد مفقود.
 *  3. كل مقزّم باقٍ متصل يصبح خطًّا مستقلًّا بنفس اللون والسماكة ومعرّف جديد.
 *  4. تقليم الشظايا الدقيقة (specks) تحت العتبة البصرية max(6px, 1.8×السماكة)
 *     حسب تقنية tldraw-continuous-eraser — فلا تبقى حبيبات بعد المسح.
 *
 * دالة نقية بالكامل (بلا DOM) — لا تلمس أي من إصلاحات الطبقة الأخرى.
 */
import type { Stroke, StrokePoint } from "../components/DarAlHikayatHandwriting";

const pointInDisk = (x: number, y: number, ex: number, ey: number, r2: number): boolean => {
  const dx = x - ex;
  const dy = y - ey;
  return dx * dx + dy * dy <= r2;
};

/**
 * قيم t في (0,1) التي تعبر عندها الضلع a→b حدود دائرة المسح (المقاس r).
 * a وb خارج الدائرة عادةً: 0 نقطة (لا تقاطع)، 1 (إمالة/تماس)، 2 (الضلع ينفذ
 * خلال الدائرة ويخرج منها).
 */
const segmentCircleTs = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number
): number[] => {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a === 0) return [];
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const sq = Math.sqrt(disc);
  const inv2a = 1 / (2 * a);
  const t1 = (-b - sq) * inv2a;
  const t2 = (-b + sq) * inv2a;
  const ts: number[] = [];
  if (t1 > 0 && t1 < 1) ts.push(t1);
  if (t2 > 0 && t2 < 1 && Math.abs(t2 - t1) > 1e-9) ts.push(t2);
  return ts;
};

const lerpPoint = (a: StrokePoint, b: StrokePoint, t: number): StrokePoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  pressure: a.pressure + (b.pressure - a.pressure) * t,
  time: a.time + (b.time - a.time) * t,
});

const arcLength = (points: StrokePoint[]): number => {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
};

const diagonalSpan = (points: StrokePoint[]): number => {
  const a = points[0];
  const b = points[points.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const makeFragmentId = (baseId: string, index: number): string =>
  `${baseId}_e${index}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * يطرح قرص المسح من خط واحد ويُرجع المقزّم المتبقية كخطوط مستقلة.
 *
 * @returns مصفوفة فيها الكائن نفسه (`[stroke]`) تماماً إذا لم يلمسه القرص —
 *          فيحتفظ النداءي بالمراجع الأصلية وذاكرة الحدود المؤقتة دون تغيير.
 */
export function eraseStrokePortion(
  stroke: Stroke,
  ex: number,
  ey: number,
  radius: number
): Stroke[] {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return [stroke];

  const r2 = radius * radius;

  // فحص التأكد (الناحية الدقيقة بعد فرز AABB في النداءي)
  let touched = false;
  for (let i = 0; i < pts.length; i++) {
    if (pointInDisk(pts[i].x, pts[i].y, ex, ey, r2)) {
      touched = true;
      break;
    }
    if (i > 0) {
      const prev = pts[i - 1];
      if (segmentCircleTs(prev.x, prev.y, pts[i].x, pts[i].y, ex, ey, radius).length > 0) {
        touched = true;
        break;
      }
    }
  }
  if (!touched) return [stroke];

  // المسح الفعلي: جمع المقامز المتبقية المتصلة مع قصّ الأطراف عند حدود القرص
  const fragments: StrokePoint[][] = [];
  let current: StrokePoint[] | null = null;

  const flush = () => {
    if (current && current.length > 0) fragments.push(current);
    current = null;
  };

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const inside = pointInDisk(p.x, p.y, ex, ey, r2);

    if (i > 0) {
      const prev = pts[i - 1];
      const prevInside = pointInDisk(prev.x, prev.y, ex, ey, r2);
      const ts = segmentCircleTs(prev.x, prev.y, p.x, p.y, ex, ey, radius);

      if (!prevInside && inside) {
        // دخول: يُضاف مقطع القصّ للمقزّم الحالي ثم يُغلق معًا بعد ذلك في الفرع العام
        if (ts.length > 0 && current) current.push(lerpPoint(prev, p, ts[0]));
      } else if (prevInside && !inside) {
        // خروج: يبدأ مقزّم جديد عند نقطة الخروج بالضبط
        current = ts.length > 0 ? [lerpPoint(prev, p, ts[ts.length - 1])] : [];
      } else if (!prevInside && !inside && ts.length === 2) {
        // اختراق كامل بين نقطتين خارجيتين: إغلاق عند الدخول وفتح عند الخروج
        if (current) {
          current.push(lerpPoint(prev, p, ts[0]));
          flush();
        }
        current = [lerpPoint(prev, p, ts[1])];
      }
      // prevInside && inside: الضلع داخل القرص بالكامل — لا شيء يُضاف
    }

    if (inside) {
      flush();
    } else {
      if (!current) current = [];
      current.push(p);
    }
  }
  flush();

  // تقليم الشظايا الدقيقة (hate granular specks) — قاعدة tldraw-continuous-eraser
  const speckThreshold = Math.max(6, stroke.width * 1.8);
  const kept = fragments.filter((f) => {
    if (f.length < 2) return false;
    return arcLength(f) >= speckThreshold || diagonalSpan(f) >= speckThreshold;
  });

  return kept.map((points, index) => ({
    id: makeFragmentId(stroke.id, index),
    color: stroke.color,
    width: stroke.width,
    points,
  }));
}
