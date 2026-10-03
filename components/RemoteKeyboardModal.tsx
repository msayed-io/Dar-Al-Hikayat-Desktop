import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Smartphone,
  Copy,
  Check,
  X,
  Wifi,
  WifiOff,
  CheckCircle2,
} from "lucide-react";
import {
  getDeviceLocalIp,
  NetworkIpResult
} from "../lib/remote-keyboard-service";

interface RemoteKeyboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  isConnected: boolean;
  onDisconnect?: () => void;
  sessionPin: string;
  currentTheme: any;
}

export const RemoteKeyboardModal: React.FC<RemoteKeyboardModalProps> = ({
  isOpen,
  onClose,
  isConnected,
  onDisconnect,
  sessionPin,
  currentTheme,
}) => {
  const [networkInfo, setNetworkInfo] = useState<NetworkIpResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    getDeviceLocalIp().then((info) => {
      setNetworkInfo(info);
    });
  }, [isOpen]);

  if (!isOpen) return null;

  // ONE official path only: the native "كيبورد الحكايات" app scans this QR.
  // The browser route is no longer offered as a pairing path (by design).
  const pairingUrl = networkInfo?.primaryIp
    ? `${networkInfo.connectionUrl}?pin=${sessionPin}`
    : null;

  const copyUrl = () => {
    if (!pairingUrl) return;
    navigator.clipboard.writeText(pairingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isDark = currentTheme?.isDark ?? true;
  const themeBg = currentTheme?.bg || (isDark ? "#121A1B" : "#EAE6D2");
  const themeBorder = currentTheme?.border || (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)");
  const themeText = currentTheme?.text || (isDark ? "#F4F1EA" : "#121A1B");
  const themeSecondary = currentTheme?.secondary || (isDark ? "#8E9899" : "#666666");
  const themeAccent = currentTheme?.accent || "#D97706";

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[24px] p-4 border shadow-2xl relative flex flex-col gap-3.5 overflow-hidden transition-all"
        style={{
          backgroundColor: themeBg,
          borderColor: themeBorder,
          color: themeText,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Header */}
        <div
          className="flex items-center justify-between pb-2.5 border-b"
          style={{ borderColor: themeBorder }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: isConnected
                  ? "rgba(16, 185, 129, 0.15)"
                  : `${themeAccent}18`,
                color: isConnected ? "#10B981" : themeAccent,
              }}
            >
              <Smartphone className="w-3.5 h-3.5" />
            </div>
            <h3 className="font-zain-bold text-sm leading-none whitespace-nowrap truncate">
              ربط الكيبورد اللاسلكي
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Status Indicator */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-zain-bold whitespace-nowrap shrink-0"
              style={{
                backgroundColor: isConnected
                  ? "rgba(16, 185, 129, 0.15)"
                  : `${themeAccent}15`,
                color: isConnected ? "#10B981" : themeAccent,
              }}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnected
                    ? "bg-emerald-500 animate-ping"
                    : "bg-amber-500 animate-pulse"
                }`}
              />
              <span>{isConnected ? "متصل بنجاح 🟢" : "في انتظار الهاتف"}</span>
            </div>

            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer opacity-70 hover:opacity-100"
              style={{ color: themeText }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content Body - Conditional on Connection State */}
        {isConnected ? (
          /* CONNECTED STATE VIEW */
          <div className="flex flex-col gap-3 py-1">
            <div
              className="flex items-center gap-3 p-3 rounded-2xl border bg-emerald-500/10 border-emerald-500/20"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-zain-bold text-xs text-emerald-600 dark:text-emerald-400">
                  لوحة المفاتيح متصلة بنجاح!
                </span>
                <span className="font-zain-reg text-[11px] opacity-80 leading-tight">
                  كيبورد التابلت مخفي تلقائياً أثناء الاتصال. الكتابة والتشكيل والماوس (🖱️ من تطبيق
                  الهاتف) تعمل مباشرة على دار الحكايات.
                </span>
              </div>
            </div>

            {/* Active connection details */}
            <div
              className="flex flex-col gap-2 p-3 rounded-2xl border text-xs"
              style={{
                backgroundColor: isDark ? "rgba(0, 0, 0, 0.2)" : "rgba(0, 0, 0, 0.03)",
                borderColor: themeBorder,
              }}
            >
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: themeSecondary }}>عنوان الرابط النشط:</span>
                <span className="font-mono text-emerald-500 text-[10px] dir-ltr truncate max-w-[170px]">
                  {pairingUrl || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: themeSecondary }}>رمز الأمان (PIN):</span>
                <span className="font-mono font-bold text-emerald-500">{sessionPin}</span>
              </div>
            </div>

            {/* Disconnect Option */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                onClick={() => {
                  onDisconnect?.();
                }}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full font-zain-bold text-xs border transition cursor-pointer active:scale-95 text-rose-500 border-rose-500/30 hover:bg-rose-500/10"
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span>قطع الاتصال</span>
              </button>

              <button
                onClick={onClose}
                className="px-4 py-2 rounded-full font-zain-bold text-xs shadow-sm transition cursor-pointer active:scale-95 shrink-0 whitespace-nowrap"
                style={{
                  backgroundColor: themeAccent,
                  color: isDark ? "#121A1B" : "#FFFFFF",
                }}
              >
                الانتقال للمحرر
              </button>
            </div>
          </div>
        ) : (
          /* PAIRING / QR CODE VIEW */
          <>
            <div className="flex items-center gap-3.5 py-0.5">
              {/* QR Code Container */}
              <div
                className="shrink-0 p-2 bg-white rounded-2xl shadow-sm border flex items-center justify-center overflow-hidden bg-clip-padding transition-all"
                style={{
                  borderColor: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)",
                }}
              >
                {pairingUrl ? (
                  <QRCodeSVG
                    value={pairingUrl}
                    size={102}
                    level="M"
                    includeMargin={true}
                    fgColor="#0F172A"
                    bgColor="#FFFFFF"
                  />
                ) : (
                  <div className="w-[134px] h-[134px] flex flex-col items-center justify-center gap-2 text-center px-2">
                    <Wifi className="w-5 h-5 opacity-60" style={{ color: themeAccent }} />
                    <span className="text-[10px] font-zain-reg" style={{ color: themeSecondary }}>
                      جارٍ تشغيل السيرفر المحلي…
                    </span>
                  </div>
                )}
              </div>

              {/* Details Column */}
              <div className="flex-1 flex flex-col justify-center gap-2 min-w-0">
                {/* Direct URL Box */}
                <div className="flex flex-col gap-1">
                  <span
                    className="text-[10px] font-zain-bold leading-tight"
                    style={{ color: themeSecondary }}
                  >
                    ١. افتح تطبيق «كيبورد الحكايات» على الهاتف
                    <br />
                    ٢. امسح الرمز بالكاميرا للاقتران
                  </span>
                  <div
                    className="flex items-center justify-between px-3 py-1.5 rounded-full border min-w-0 bg-clip-padding"
                    style={{
                      backgroundColor: isDark
                        ? "rgba(0, 0, 0, 0.25)"
                        : "rgba(0, 0, 0, 0.04)",
                      borderColor: themeBorder,
                    }}
                  >
                    <span
                      className="truncate text-[10px] font-mono dir-ltr min-w-0 pl-1"
                      style={{ color: themeAccent }}
                    >
                      {pairingUrl || "—"}
                    </span>
                    <button
                      onClick={copyUrl}
                      className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-zain-bold transition cursor-pointer shrink-0 mr-1 active:scale-95 whitespace-nowrap"
                      style={{
                        backgroundColor: `${themeAccent}25`,
                        color: themeAccent,
                      }}
                      title="نسخ الرابط"
                    >
                      {copied ? (
                        <Check className="w-2.5 h-2.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-2.5 h-2.5" />
                      )}
                      <span>{copied ? "تم" : "نسخ"}</span>
                    </button>
                  </div>
                </div>

                {/* PIN Code Box */}
                <div
                  className="flex items-center justify-between px-3 py-1.5 rounded-full border text-xs bg-clip-padding"
                  style={{
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.02)"
                      : "rgba(0, 0, 0, 0.02)",
                    borderColor: themeBorder,
                  }}
                >
                  <span
                    className="font-zain-reg text-[10px]"
                    style={{ color: themeSecondary }}
                  >
                    رمز الأمان (PIN):
                  </span>
                  <span
                    className="font-mono font-bold tracking-widest text-xs"
                    style={{ color: themeAccent }}
                  >
                    {sessionPin}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer Action Bar */}
            <div
              className="flex items-center justify-between pt-2.5 border-t"
              style={{ borderColor: themeBorder }}
            >
              <span
                className="text-[10px] font-zain-reg opacity-80 leading-tight"
                style={{ color: themeSecondary }}
              >
                المسار الرسمي الوحيد: تطبيق كيبورد الحكايات 🖱️
                <br />
                الكتابة + التشكيل + الماوس والمؤشر داخل دار الحكايات
              </span>

              <button
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-full font-zain-bold text-[11px] shadow-sm transition cursor-pointer active:scale-95 shrink-0 whitespace-nowrap"
                style={{
                  backgroundColor: themeAccent,
                  color: isDark ? "#121A1B" : "#FFFFFF",
                }}
              >
                الانتقال للمحرر
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RemoteKeyboardModal;
