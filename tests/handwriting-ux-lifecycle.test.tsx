/** @vitest-environment jsdom */
import React, { createRef, act } from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import DarAlHikayatHandwriting, { type HandwritingHandle } from "../components/DarAlHikayatHandwriting";
import { setupDom, theme, EMPTY_STROKES, sampleStrokes, element, click, pointer, input } from "./helpers/handwriting-dom";

let dom: ReturnType<typeof setupDom>;
beforeEach(() => { dom = setupDom(); });
afterEach(() => dom.cleanup());

async function render(props: Partial<React.ComponentProps<typeof DarAlHikayatHandwriting>> = {}, ref = createRef<HandwritingHandle>()) {
  await dom.render(<DarAlHikayatHandwriting
    ref={ref} isActive theme={theme} initialStrokes={EMPTY_STROKES} onClose={vi.fn()} {...props}
  />);
  return ref;
}

describe("Handwriting document controls (not inking geometry)", () => {
  it("edits the controlled title with the same input interaction as the editor", async () => {
    const change = vi.fn();
    await render({ title: "حكايتي", onTitleChange: change });
    await click("#handwriting-document-layer h1");
    expect(element<HTMLInputElement>('input[aria-label="عنوان الحكاية"]').value).toBe("حكايتي");
    await input('input[aria-label="عنوان الحكاية"]', "عنوان جديد");
    expect(change).toHaveBeenCalledWith("عنوان جديد");
    await act(async () => element<HTMLInputElement>('input[aria-label="عنوان الحكاية"]').blur());
    expect(document.querySelector('#handwriting-document-layer input')).toBeNull();
  });

  it("back calls document navigation; checkmark calls persistence, never onClose", async () => {
    const close = vi.fn();
    const save = vi.fn().mockResolvedValue("saved");
    await render({ onClose: close, onSave: save });
    await click('#handwriting-document-layer button[title="حفظ"]');
    expect(save).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    await click('#handwriting-document-layer button[title="رجوع"]');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it.each(["empty", "failed"] as const)("reports %s without conflating failure and empty content", async (result) => {
    await render({ onSave: vi.fn().mockResolvedValue(result) });
    await click('#handwriting-document-layer button[title="حفظ"]');
    const text = element('[role="status"]').textContent;
    expect(text).toContain(result === "empty" ? "حكاية فارغة" : "تعذر الحفظ");
    if (result === "failed") expect(text).not.toContain("فارغة");
  });

  it("never serializes a blank canvas as meaningful content", async () => {
    const ref = await render();
    expect(ref.current?.getDataUrl()).toBe("");
    expect(dom.encode).not.toHaveBeenCalled();
  });

  it("clearing all ink also clears the exported image, even after the old 800ms delay", async () => {
    const changed = vi.fn();
    const ref = await render({ initialStrokes: sampleStrokes, onStrokesChange: changed });
    vi.useFakeTimers();
    try {
      await act(async () => ref.current?.clear());
      await act(async () => vi.advanceTimersByTime(1000));
      expect(ref.current?.getStrokes()).toEqual([]);
      expect(ref.current?.getDataUrl()).toBe("");
      expect(changed).toHaveBeenCalledTimes(1);
      expect(changed).toHaveBeenLastCalledWith([], false, "");
      expect(dom.encode).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("retains the viewport portal and independent paper in both edit and reading modes", async () => {
    dom.host.style.transform = "translateY(20px) scale(.94)";
    const ref = await render({ initialStrokes: sampleStrokes });
    const canvas = element<HTMLCanvasElement>("#handwriting-canvas-layer");
    expect(element("#handwriting-document-layer").parentElement).toBe(document.body);
    const size = [canvas.width, canvas.height];
    await render({ isActive: false, isReadingMode: true, initialStrokes: sampleStrokes }, ref);
    expect(element("#handwriting-document-layer").parentElement).toBe(document.body);
    expect(element("#handwriting-document-layer").style.backgroundColor).not.toBe("transparent");
    expect(element("#handwriting-document-layer").style.zIndex).toBe("999999");
    expect(element("#handwriting-canvas-layer")).toBe(canvas);
    expect([canvas.width, canvas.height]).toEqual(size);
    expect(document.querySelector('#handwriting-document-layer button[title="خروج"]')).not.toBeNull();
    expect(document.querySelector('#handwriting-document-layer button[title="تعديل الكتابة اليدوية"]')).not.toBeNull();
    expect(document.querySelector('#handwriting-document-layer button[title="حفظ"]')).toBeNull();
  });

  it("reopens far-down first ink inside the reader viewport without moving its document coordinates", async () => {
    const far = sampleStrokes.map((stroke) => ({
      ...stroke, points: stroke.points.map((point) => ({ ...point, y: point.y + 9000 })),
    }));
    const before = JSON.stringify(far);
    const ref = await render({ isActive: false, isReadingMode: true, initialStrokes: far });
    expect(dom.context.translate).toHaveBeenCalledWith(0, -(9150 - 112));
    expect(JSON.stringify(ref.current?.getStrokes())).toBe(before);
  });

  it("cannot invoke save/back while persistence is in flight", async () => {
    const save = vi.fn(); const close = vi.fn();
    await render({ isSaving: true, onSave: save, onClose: close });
    await click('#handwriting-document-layer button[title="حفظ"]');
    await click('#handwriting-document-layer button[title="رجوع"]');
    expect(save).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});

describe("Reader tap isolation", () => {
  let edit = vi.fn<() => void>();
  beforeEach(async () => {
    edit = vi.fn();
    await render({ isActive: false, isReadingMode: true, initialStrokes: sampleStrokes, onReturnToEdit: edit });
  });

  it("only a tap starting on the canvas returns to handwriting", async () => {
    await pointer(element("#handwriting-canvas-layer"), "pointerdown");
    await pointer(window, "pointerup");
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it("header buttons and stray window pointerup cannot trigger editing", async () => {
    await pointer(window, "pointerup");
    await pointer(element('#handwriting-document-layer button[title="خروج"]'), "pointerdown", 350, 40);
    await pointer(window, "pointerup", 350, 40);
    expect(edit).not.toHaveBeenCalled();
  });

  it.each([[190, 180], [100, 90]])("a drag to (%s, %s) remains in reading mode", async (x, y) => {
    await pointer(element("#handwriting-canvas-layer"), "pointerdown");
    await pointer(window, "pointermove", x, y);
    await pointer(window, "pointerup", x, y);
    expect(edit).not.toHaveBeenCalled();
  });

  it("a canceled gesture remains in reading mode", async () => {
    await pointer(element("#handwriting-canvas-layer"), "pointerdown");
    await pointer(window, "pointercancel");
    await pointer(window, "pointerup");
    expect(edit).not.toHaveBeenCalled();
  });

  it("multi-touch remains in reading mode", async () => {
    await pointer(element("#handwriting-canvas-layer"), "pointerdown", 100, 180, 1);
    await pointer(element("#handwriting-canvas-layer"), "pointerdown", 150, 180, 2);
    await pointer(window, "pointerup", 100, 180, 1);
    await pointer(window, "pointerup", 150, 180, 2);
    expect(edit).not.toHaveBeenCalled();
  });

  it("reader clicks do not bubble to the hidden text editor", async () => {
    const outer = vi.fn();
    await dom.render(<div onClick={outer}><DarAlHikayatHandwriting isActive={false} isReadingMode
      initialStrokes={sampleStrokes} theme={theme} onClose={vi.fn()} /></div>);
    await act(async () => element("#handwriting-canvas-layer").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(outer).not.toHaveBeenCalled();
  });
});
