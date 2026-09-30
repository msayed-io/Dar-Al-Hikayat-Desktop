import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Sparkles,
  Download,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ExternalLink,
  ArrowDownToLine,
  X,
} from "lucide-react";
import { useApp } from "../contexts/AppContext";
import {
  type UpdateInfo,
  type AppVersion,
  type DownloadProgress,
  subscribeToUpdateDialog,
  closeUpdateDialog,
  downloadUpdate,
  installDownloadedUpdate,
  ignoreUpdateVersion,
} from "../lib/app-updater";

export const UpdateDialog: React.FC = () => {
  const { currentTheme } = useApp();

  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    updateInfo: UpdateInfo | null;
    currentVersion: AppVersion | null;
    isMandatory?: boolean;
  }>({
    isOpen: false,
    updateInfo: null,
    currentVersion: null,
    isMandatory: false,
  });

  const [step, setStep] = useState<
    "prompt" | "downloading" | "verifying" | "ready_to_install" | "error"
  >("prompt");

  const [progress, setProgress] = useState<DownloadProgress>({
    progress: 0,
    bytesDownloaded: 0,
    totalBytes: 0,
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadedFilePath, setDownloadedFilePath] = useState<string | null>(null);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    let element = document.getElementById("dar-update-dialog-root");
    if (!element) {
      element = document.createElement("div");
      element.id = "dar-update-dialog-root";
      element.style.position = "relative";
      element.style.zIndex = "2147483647";
      document.body.appendChild(element);
    }
    setPortalNode(element);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToUpdateDialog((state) => {
      setDialogState(state);
      if (state.isOpen) {
        setStep("prompt");
        setProgress({ progress: 0, bytesDownloaded: 0, totalBytes: 0 });
        setErrorMessage(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleStartUpdate = async () => {
    if (!dialogState.updateInfo) return;

    if (step === "ready_to_install" && downloadedFilePath) {
      try {
        await installDownloadedUpdate(downloadedFilePath);
      } catch (err: any) {
        setErrorMessage(err?.message || "تعذر فتح شاشة تثبيت التحديث.");
        setStep("error");
      }
      return;
    }


    setStep("downloading");
    setErrorMessage(null);
    setProgress({ progress: 0, bytesDownloaded: 0, totalBytes: 0 });

    try {
      const result = await downloadUpdate(
        dialogState.updateInfo,
        (p) => {
          setProgress(p);
          if (p.progress >= 99) {
            setStep("verifying");
          }
        }
      );

      if (result.success) {
        setDownloadedFilePath(result.filePath || null);
        setStep("ready_to_install");
      }
    } catch (err: any) {
      console.error("Update process failed:", err);
      setErrorMessage(
        err?.message || "حدث خطأ غير متوقع أثناء تنزيل التحديث. يرجى إعادة المحاولة."
      );
      setStep("error");
    }
  };


  const handleIgnore = () => {
    if (dialogState.updateInfo) {
      ignoreUpdateVersion(dialogState.updateInfo.versionName);
    }
    closeUpdateDialog();
  };

  const formatMB = (bytes: number) => {
    if (!bytes || bytes <= 0) return "";
    return (bytes / (1024 * 1024)).toFixed(1) + " م.ب";
  };

  if (!dialogState.isOpen || !dialogState.updateInfo) {
    return null;
  }

  const { updateInfo, isMandatory } = dialogState;

  const modalContent = (
    <div
      id="dar-update-dialog-overlay"
      dir="rtl"
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      style={{
        zIndex: 2147483647,
        isolation: "isolate",
        pointerEvents: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isMandatory && step === "prompt") {
          handleIgnore();
        }
      }}
    >
      <div
        className="unlock-modal border shadow-2xl text-center animate-in zoom-in-95 duration-200 relative flex flex-col items-center select-none"
        style={{
          width: "280px",
          maxWidth: "calc(100vw - 32px)",
          borderRadius: "28px",
          padding: "24px 20px",
          backgroundColor: currentTheme.bg,
          borderColor: currentTheme.border,
          boxShadow: `0 20px 45px -10px ${currentTheme.shadow || "rgba(0,0,0,0.3)"}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── STEP 1: Prompt & Release Notes ─── */}
        {step === "prompt" && (
          <>
            {/* Top Pure Icon - Pure & Standing on its own without extra circles */}
            <div className="flex justify-center mb-3">
              <Sparkles
                className="w-7 h-7"
                style={{ color: currentTheme.accent }}
                strokeWidth={2}
              />
            </div>

            {/* Dialog Title */}
            <h2
              className="text-base font-zain-xbold mb-1.5 leading-tight text-center"
              style={{ color: currentTheme.text }}
            >
              تحديث دار الحكايات
            </h2>

            {/* Version Badge */}
            <div className="flex justify-center mb-3.5">
              <span
                className="px-3.5 py-1 rounded-full text-[11px] font-zain-bold border leading-tight flex items-center justify-center whitespace-nowrap"
                style={{
                  backgroundColor: `${currentTheme.accent}12`,
                  borderColor: `${currentTheme.accent}30`,
                  color: currentTheme.accent,
                }}
              >
                الإصدار الجديد {updateInfo.versionName}
              </span>
            </div>

            {/* Release Notes (if any) */}
            {updateInfo.releaseNotes && updateInfo.releaseNotes.length > 0 ? (
              <div
                className="w-full text-right p-3 rounded-2xl border mb-3.5 max-h-36 overflow-y-auto"
                style={{
                  backgroundColor: `${currentTheme.accent}0a`,
                  borderColor: `${currentTheme.accent}25`,
                }}
              >
                <ul className="space-y-1.5">
                  {updateInfo.releaseNotes.map((note, index) => (
                    <li
                      key={index}
                      className="text-xs font-zain-reg leading-relaxed opacity-90 flex items-start gap-2"
                      style={{ color: currentTheme.text }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: currentTheme.accent }}
                      />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p
                className="text-xs font-zain-reg mb-3.5 opacity-70 leading-relaxed text-center px-1"
                style={{ color: currentTheme.text }}
              >
                يتوفر إصدار أحدث يضم تحسينات للأداء وميزات جديدة.
              </p>
            )}

            {/* Subtext reassurance - Single horizontal line, refined text size */}
            <p
              className="text-[10px] font-zain-reg opacity-65 mb-4 text-center leading-normal whitespace-nowrap overflow-hidden text-ellipsis w-full"
              style={{ color: currentTheme.text }}
            >
              نسخة رسمية وموقعة • بياناتك وحكاياتك آمنة
            </p>

            {/* Action Buttons - Capsule Pill Buttons matching Story Lock Dialog */}
            <div className="flex items-center justify-center gap-2.5">
              <button
                onClick={handleStartUpdate}
                className="font-zain-bold text-xs shadow-sm active:scale-95 transition-all flex items-center justify-center cursor-pointer gap-1.5"
                style={{
                  height: "34px",
                  padding: "0 22px",
                  borderRadius: "9999px",
                  backgroundColor: currentTheme.accent,
                  color: currentTheme.bg,
                  whiteSpace: "nowrap",
                }}
              >
                <Download className="w-3.5 h-3.5" />
                <span>تنزيل EXE الآن</span>
              </button>

              {!isMandatory && (
                <button
                  onClick={handleIgnore}
                  className="font-zain-bold text-xs active:scale-95 transition-all cursor-pointer opacity-70 hover:opacity-100 flex items-center justify-center"
                  style={{
                    height: "34px",
                    padding: "0 16px",
                    borderRadius: "9999px",
                    color: currentTheme.secondary,
                    whiteSpace: "nowrap",
                  }}
                >
                  لاحقًا
                </button>
              )}
            </div>
          </>
        )}

        {/* ─── STEP 2: Downloading Progress ─── */}
        {step === "downloading" && (
          <>
            <div className="flex justify-center mb-3">
              <ArrowDownToLine
                className="w-7 h-7 animate-bounce"
                style={{ color: currentTheme.accent }}
                strokeWidth={2}
              />
            </div>

            <h2
              className="text-base font-zain-xbold mb-1 leading-tight text-center"
              style={{ color: currentTheme.text }}
            >
              جاري تنزيل التحديث
            </h2>

            <p
              className="text-xs font-zain-reg mb-3 opacity-70 leading-relaxed text-center px-1"
              style={{ color: currentTheme.text }}
            >
              يرجى الانتظار لحين اكتمال تنزيل حزمة التحديث
            </p>

            {/* Progress Percentage & Sizes */}
            <div className="w-full flex items-center justify-between text-xs font-zain-bold mb-1 px-1">
              <span style={{ color: currentTheme.accent }}>
                {progress.progress}%
              </span>
              {progress.totalBytes > 0 && (
                <span
                  className="font-mono text-[10px] opacity-60"
                  dir="ltr"
                  style={{ color: currentTheme.text }}
                >
                  {formatMB(progress.bytesDownloaded)} / {formatMB(progress.totalBytes)}
                </span>
              )}
            </div>

            {/* Capsule Progress Bar */}
            <div
              className="w-full h-2 rounded-full border overflow-hidden p-0.5 mb-4"
              style={{
                backgroundColor: `${currentTheme.accent}0a`,
                borderColor: currentTheme.border,
              }}
            >
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  width: `${Math.max(5, progress.progress)}%`,
                  backgroundColor: currentTheme.accent,
                }}
              />
            </div>

            {!isMandatory && (
              <button
                onClick={closeUpdateDialog}
                className="font-zain-bold text-xs active:scale-95 transition-all cursor-pointer opacity-70 hover:opacity-100 flex items-center justify-center"
                style={{
                  height: "34px",
                  padding: "0 18px",
                  borderRadius: "9999px",
                  color: currentTheme.secondary,
                  whiteSpace: "nowrap",
                }}
              >
                إلغاء التنزيل
              </button>
            )}
          </>
        )}

        {/* ─── STEP 3: Verifying SHA-256 Checksum ─── */}
        {step === "verifying" && (
          <>
            <div className="flex justify-center mb-3">
              <Loader2
                className="w-7 h-7 animate-spin"
                style={{ color: currentTheme.accent }}
                strokeWidth={2}
              />
            </div>

            <h2
              className="text-base font-zain-xbold mb-1 leading-tight text-center"
              style={{ color: currentTheme.text }}
            >
              فحص سلامة الحزمة
            </h2>

            <p
              className="text-xs font-zain-reg mb-2 opacity-70 leading-relaxed text-center px-1"
              style={{ color: currentTheme.text }}
            >
              جاري التحقق من البصمة الرقمية (SHA-256) للتأكد من سلامة الملف ومطابقته للأصل...
            </p>
          </>
        )}

        {/* ─── STEP 4: Ready To Install ─── */}
        {step === "ready_to_install" && (
          <>
            <div className="flex justify-center mb-3">
              <CheckCircle2
                className="w-7 h-7 text-emerald-600 dark:text-emerald-400"
                strokeWidth={2}
              />
            </div>

            <h2
              className="text-base font-zain-xbold mb-1 leading-tight text-center"
              style={{ color: currentTheme.text }}
            >
              تم فتح تنزيل التحديث
            </h2>

            <p
              className="text-xs font-zain-reg mb-4 opacity-75 leading-relaxed text-center px-1"
              style={{ color: currentTheme.text }}
            >
              تم فتح تنزيل مثبت Windows الرسمي. بعد اكتمال التنزيل شغّل ملف EXE لتثبيت الإصدار الجديد.
            </p>

            <button
              onClick={handleStartUpdate}
              className="font-zain-bold text-xs shadow-sm active:scale-95 transition-all flex items-center justify-center cursor-pointer gap-1.5"
              style={{
                height: "34px",
                padding: "0 22px",
                borderRadius: "9999px",
                backgroundColor: currentTheme.accent,
                color: currentTheme.bg,
                whiteSpace: "nowrap",
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>فتح تنزيل EXE مرة أخرى</span>
            </button>
          </>
        )}

        {/* ─── ERROR STATE ─── */}
        {step === "error" && (
          <>
            <div className="flex justify-center mb-3">
              <AlertTriangle
                className="w-7 h-7 text-red-500"
                strokeWidth={2}
              />
            </div>

            <h2
              className="text-base font-zain-xbold mb-1 leading-tight text-center text-red-500"
            >
              تعذر إتمام التحديث
            </h2>

            <p
              className="text-xs font-zain-reg mb-4 opacity-80 leading-relaxed text-center px-1 text-red-500"
            >
              {errorMessage}
            </p>

            <div className="flex items-center justify-center gap-2.5">
              <button
                onClick={handleStartUpdate}
                className="font-zain-bold text-xs shadow-sm active:scale-95 transition-all flex items-center justify-center cursor-pointer gap-1.5"
                style={{
                  height: "34px",
                  padding: "0 18px",
                  borderRadius: "9999px",
                  backgroundColor: currentTheme.accent,
                  color: currentTheme.bg,
                  whiteSpace: "nowrap",
                }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>إعادة المحاولة</span>
              </button>

              <button
                onClick={closeUpdateDialog}
                className="font-zain-bold text-xs active:scale-95 transition-all cursor-pointer opacity-70 hover:opacity-100 flex items-center justify-center"
                style={{
                  height: "34px",
                  padding: "0 14px",
                  borderRadius: "9999px",
                  color: currentTheme.secondary,
                  whiteSpace: "nowrap",
                }}
              >
                إغلاق
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  const targetNode =
    portalNode ||
    (typeof document !== "undefined"
      ? document.getElementById("dar-update-dialog-root") || document.body
      : null);

  if (targetNode) {
    return createPortal(modalContent, targetNode);
  }

  return modalContent;
};
