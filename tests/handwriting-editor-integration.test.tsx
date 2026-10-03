/** @vitest-environment jsdom */
import React, { act } from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { NoteSaveData } from "../contexts/AppContext";
import { setupDom, theme, sampleStrokes, element, click, draw, input } from "./helpers/handwriting-dom";

const app = vi.hoisted(() => ({
  selectedNote: null as any, currentTheme: {} as any,
  backToHome: vi.fn(), saveNote: vi.fn(), toggleTheme: vi.fn(),
}));
vi.mock("../contexts/AppContext", () => ({ useApp: () => app }));
vi.mock("../lib/storage-service", () => ({ StorageService: { getStoryBody: vi.fn().mockResolvedValue("") } }));
vi.mock("../components/DarAlHikayatAIAssistant", () => ({ default: () => null }));
vi.mock("../components/RemoteKeyboardModal", () => ({ default: () => null }));
vi.mock("../lib/remote-keyboard-service", () => ({ listenForRemoteKeystrokes: () => () => {}, updateRemoteSession: vi.fn() }));
import Editor from "../components/DarAlHikayatEditor";

let dom: ReturnType<typeof setupDom>;
beforeEach(() => {
  dom = setupDom();
  app.selectedNote = null;
  app.currentTheme = theme;
  app.backToHome.mockReset();
  app.saveNote.mockReset().mockResolvedValue(true);
});
afterEach(() => { dom.cleanup(); vi.useRealTimers(); });

async function openHandwriting() {
  await dom.render(<Editor />);
  await click("#handwriting-mode-trigger-btn");
  expect(element("#handwriting-document-layer").dataset.mode).toBe("edit");
}
const hwButton = (title: string) => `#handwriting-document-layer button[title="${title}"]`;
const payload = () => app.saveNote.mock.calls[0][0] as NoteSaveData;

function deferredSave() {
  let resolve!: (success: boolean) => void;
  app.saveNote.mockImplementation(() => new Promise<boolean>((done) => { resolve = done; }));
  return (success: boolean) => act(async () => resolve(success));
}

describe("Handwriting → persistence → reading/home", () => {
  it("a new empty handwriting document exits straight to home", async () => {
    await openHandwriting();
    await click(hwButton("رجوع"));
    expect(app.backToHome).toHaveBeenCalledTimes(1);
    expect(app.saveNote).not.toHaveBeenCalled();
    expect(document.querySelector(".confirm-dialog")).toBeNull();
  });

  it("rejects an empty checkmark save even when PNG serialization would return a long string", async () => {
    await openHandwriting();
    await click(hwButton("حفظ"));
    expect(app.saveNote).not.toHaveBeenCalled();
    expect(dom.encode).not.toHaveBeenCalled();
    expect(element("#handwriting-document-layer").dataset.mode).toBe("edit");
    expect(element('#handwriting-document-layer [role="status"]').textContent).toContain("فارغة");
  });

  it("persists title and ink directly, then displays the handwritten reader", async () => {
    await openHandwriting();
    await draw();
    await click("#handwriting-document-layer h1");
    await input('input[aria-label="عنوان الحكاية"]', "مخطوطتي الجديدة");
    await click(hwButton("حفظ"));
    expect(app.saveNote).toHaveBeenCalledTimes(1);
    expect(payload().title).toBe("مخطوطتي الجديدة");
    expect(payload().styles.handwriting?.strokes).toHaveLength(1);
    expect(payload().styles.handwriting?.strokes?.[0].points[0]).toMatchObject({ x: 100, y: 180 });
    expect(element("#handwriting-document-layer").dataset.mode).toBe("read");
    expect(element("#handwriting-document-layer").parentElement).toBe(document.body);
    expect(app.backToHome).not.toHaveBeenCalled();
  });

  it("allows a custom title alone, consistently with the text editor", async () => {
    await openHandwriting();
    await click("#handwriting-document-layer h1");
    await input('input[aria-label="عنوان الحكاية"]', "عنوان فقط");
    await click(hwButton("حفظ"));
    expect(app.saveNote).toHaveBeenCalledTimes(1);
    expect(payload().styles.handwriting?.dataUrl).toBe("");
    expect(payload().styles.handwriting?.strokes).toEqual([]);
    expect(dom.encode).not.toHaveBeenCalled();
  });

  it("uses the existing save/discard dialog ABOVE the body-level handwriting portal", async () => {
    await openHandwriting();
    await draw();
    await click(hwButton("رجوع"));
    const dialog = element('.confirm-dialog');
    expect(dialog.textContent).toContain("هل تريد حفظ التغييرات؟");
    expect(dialog.textContent).toContain("تجاهل");
    const overlay = dialog.parentElement!;
    expect(overlay.parentElement).toBe(document.body);
    expect(Number(overlay.style.zIndex)).toBeGreaterThan(Number(element("#handwriting-document-layer").style.zIndex));
    expect(app.backToHome).not.toHaveBeenCalled();
  });

  it("discard exits without calling storage or keeping a phantom local draft", async () => {
    await openHandwriting();
    await draw();
    await click(hwButton("رجوع"));
    vi.useFakeTimers();
    await click('.confirm-dialog button:first-child');
    await act(async () => vi.advanceTimersByTime(220));
    expect(app.backToHome).toHaveBeenCalledTimes(1);
    expect(app.saveNote).not.toHaveBeenCalled();
    expect(Object.keys(localStorage).filter((k) => k.startsWith("dar_hw_"))).toEqual([]);
  });

  it("save-and-exit waits for durable persistence and ignores duplicate presses", async () => {
    const resolve = deferredSave();
    await openHandwriting(); await draw();
    await click(hwButton("رجوع"));
    await click('.confirm-dialog button:last-child');
    await click('.confirm-dialog button:last-child');
    expect(app.saveNote).toHaveBeenCalledTimes(1);
    expect(app.backToHome).not.toHaveBeenCalled();
    expect(element("#handwriting-document-layer").dataset.mode).toBe("edit");
    await resolve(true);
    expect(app.backToHome).toHaveBeenCalledTimes(1);
  });

  it("failed save-and-exit retains the ink and dialog; retry succeeds", async () => {
    app.saveNote.mockResolvedValueOnce(false).mockResolvedValue(true);
    await openHandwriting(); await draw();
    await click(hwButton("رجوع"));
    await click('.confirm-dialog button:last-child');
    expect(app.backToHome).not.toHaveBeenCalled();
    expect(document.querySelector('.confirm-dialog')).not.toBeNull();
    expect(element("#handwriting-document-layer").dataset.mode).toBe("edit");
    const first = payload().styles.handwriting?.strokes;
    await click('.confirm-dialog button:last-child');
    expect(app.saveNote.mock.calls[1][0].styles.handwriting.strokes).toEqual(first);
    expect(app.backToHome).toHaveBeenCalledTimes(1);
  });

  it("checkmark save failures do not masquerade as empty-content rejection", async () => {
    app.saveNote.mockResolvedValue(false);
    await openHandwriting(); await draw();
    await click(hwButton("حفظ"));
    expect(element("#handwriting-document-layer").dataset.mode).toBe("edit");
    const warning = element('#handwriting-document-layer [role="status"]').textContent;
    expect(warning).toContain("تعذر الحفظ");
    expect(warning).not.toContain("فارغة");
  });

  it("draw → clear all → delayed checkmark rejects empty; back leaves without a dialog", async () => {
    await openHandwriting(); await draw();
    await click('#handwriting-btn-eraser');
    await click('#capsule-eraser button[title="مسح كل الرسومات والخطوط"]');
    vi.useFakeTimers();
    await act(async () => vi.advanceTimersByTime(1000));
    await click(hwButton("حفظ"));
    expect(app.saveNote).not.toHaveBeenCalled();
    expect(dom.encode).not.toHaveBeenCalled();
    await click(hwButton("رجوع"));
    expect(document.querySelector('.confirm-dialog')).toBeNull();
    expect(app.backToHome).toHaveBeenCalledTimes(1);
  });

  it("editing a saved handwriting note uses that same id and never alters its persisted draft before save", async () => {
    const original = JSON.parse(JSON.stringify(sampleStrokes));
    app.selectedNote = {
      id: 47, title: "محفوظة", content: "", preview: "", styles: {
        fontSize: 16, fontWeight: 400, textAlign: "right", textColor: theme.text, paperStyleIndex: 0,
        handwriting: { strokes: original, isPageRuled: false, dataUrl: "" },
      },
    };
    await dom.render(<Editor />);
    expect(element("#handwriting-document-layer").dataset.mode).toBe("read");
    await click(hwButton("تعديل الكتابة اليدوية")); await draw();
    expect(app.selectedNote.styles.handwriting.strokes).toEqual(sampleStrokes);
    expect(localStorage.getItem("dar_hw_47")).toBeNull();
    await click(hwButton("حفظ"));
    expect(payload().id).toBe(47);
    expect(payload().styles.handwriting?.strokes).toHaveLength(2);
  });

  it("raster encoding failure does not prevent lossless vector persistence", async () => {
    await openHandwriting(); await draw();
    dom.encode.mockImplementation(() => { throw new Error("Device PNG encoding unavailable"); });
    await click(hwButton("حفظ"));
    expect(payload().styles.handwriting?.strokes).toHaveLength(1);
    expect(payload().styles.handwriting?.dataUrl).toBe("");
    expect(element("#handwriting-document-layer").dataset.mode).toBe("read");
  });
});

describe("Normal text editor regression gates", () => {
  it("an empty text save still rejects without mounting handwriting", async () => {
    await dom.render(<Editor />);
    await click('button[title="حفظ الحكاية"]');
    expect(app.saveNote).not.toHaveBeenCalled();
    expect(document.querySelector('#handwriting-document-layer')).toBeNull();
  });

  it("normal DOM text content and styles still save without a handwriting snapshot", async () => {
    await dom.render(<Editor />);
    const text = element<HTMLDivElement>('.editor-container');
    await act(async () => {
      text.innerHTML = '<p>حكاية نصية لا تتغير</p>';
      text.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click('button[title="حفظ الحكاية"]');
    expect(payload().content).toContain("حكاية نصية لا تتغير");
    expect(payload().styles.textColor).toBe(theme.text);
    expect(payload().styles.handwriting?.strokes).toEqual([]);
    expect(dom.encode).not.toHaveBeenCalled();
    expect(document.querySelector('#handwriting-document-layer')).toBeNull();
  });
});
