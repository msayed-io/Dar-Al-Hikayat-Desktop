import React, { useState, useEffect, useCallback, useRef } from "react";
import { useApp, type ThemeMode } from "../contexts/AppContext";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Shield,
  MapPin,
  Loader2,
  Bell,
  Compass,
  Download,
  Upload,
  Check,
  Lock,
  Unlock,
  KeyRound,
  Plus,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Wifi,
  Sparkles,
  RefreshCw,
  ArrowUpCircle,
  Smartphone,
  Layers,
  Sparkle,
} from "lucide-react";
import { CITIES, type CityData } from "../lib/prayer-cities";
import {
  autoDetectLocation,
  schedulePrayerAlarms,
  cityToLocation,
} from "../lib/prayer-alarms";
import {
  checkForUpdates,
  getCurrentAppVersion,
  openUpdateDialog,
  type AppVersion,
} from "../lib/app-updater";
import { authenticateWithWindowsHello, registerWindowsHelloCredential } from "../lib/windows-auth";
import {
  loadManagedKeysAsync,
  addManagedKey,
  deleteManagedKey,
  updateManagedKey,
  maskApiKey,
  subscribeToKeyChanges,
  testKeyConnection,
  type ManagedApiKey,
} from "../lib/api-key-repository";

import { downloadBlob } from "../lib/pdf-export";
import { StorageService } from "../lib/storage-service";
import { ImportResultModal, type FailedImportItem } from "./ImportResultModal";

const SettingsPage: React.FC = () => {
  const {
    currentTheme,
    backToHome,
    prayerState,
    updatePrayerState,
    openLocationSheet,
    toggleTheme,
    notes,
    saveNote,
    importNotesBulk,
  } = useApp();

  const [isLocked, setIsLocked] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ processed: 0, total: 0 });
  const [importResult, setImportResult] = useState<{
    isOpen: boolean;
    imported: number;
    failed: FailedImportItem[];
    isCancelled?: boolean;
  }>({ isOpen: false, imported: 0, failed: [] });
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── مفاتيح الاتصال بالمساعد الأدبي (Multi-Key Rotation) ───
  const [managedKeys, setManagedKeys] = useState<ManagedApiKey[]>([]);
  const [showAddKeyDialog, setShowAddKeyDialog] = useState(false);
  const [newKeyInput, setNewKeyInput] = useState("");
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [addKeyError, setAddKeyError] = useState<string | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<ManagedApiKey | null>(null);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [keyFeedback, setKeyFeedback] = useState<{
    id: string;
    success: boolean;
    message: string;
  } | null>(null);
  const [newKeyTestFeedback, setNewKeyTestFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // ─── إدارة وتحديثات إصدار التطبيق (OTA In-App Updates) ───
  const [appVersion, setAppVersion] = useState<AppVersion | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<{
    success: boolean;
    message: string;
    isLatest?: boolean;
  } | null>(null);

  useEffect(() => {
    getCurrentAppVersion().then((ver) => {
      setAppVersion(ver);
    });
  }, []);

  const handleCheckUpdateNow = async () => {
    setIsCheckingUpdate(true);
    setUpdateFeedback(null);
    try {
      const result = await checkForUpdates({ manual: true, force: true });
      if (result.hasUpdate && result.latestInfo && result.currentVersion) {
        setUpdateFeedback({
          success: true,
          message: `يوجد إصدار أحدث متوفر للتحميل (${result.latestInfo.versionName})`,
          isLatest: false,
        });
        openUpdateDialog(result.latestInfo, result.currentVersion, result.isMandatory);
      } else if ("error" in result && result.error) {
        setUpdateFeedback({
          success: false,
          message: result.message || "تعذر التحقق من التحديثات. تحقق من اتصال الإنترنت.",
        });
      } else {
        setUpdateFeedback({
          success: true,
          message: `أنت تستخدم أحدث إصدار من دار الحكايات (v${result.currentVersion?.versionName || "1.0"}) ✓`,
          isLatest: true,
        });
      }
    } catch (err: any) {
      setUpdateFeedback({
        success: false,
        message: err?.message || "حدث خطأ أثناء فحص التحديثات",
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useEffect(() => {
    loadManagedKeysAsync().then((loaded) => {
      setManagedKeys(loaded);
    });

    const unsubscribe = subscribeToKeyChanges(() => {
      loadManagedKeysAsync().then((loaded) => {
        setManagedKeys(loaded);
      });
    });

    return () => unsubscribe();
  }, []);

  const handleTestKey = async (item: ManagedApiKey) => {
    setTestingKeyId(item.id);
    setKeyFeedback(null);
    try {
      const res = await testKeyConnection(item.key);
      if (res.success) {
        if (item.status !== "active") {
          await updateManagedKey(item.id, {
            status: "active",
            rateLimitedAt: undefined,
            disabledReason: undefined,
          });
        }
        setKeyFeedback({
          id: item.id,
          success: true,
          message: "المفتاح متصل ويعمل بنجاح ✓",
        });
      } else {
        setKeyFeedback({
          id: item.id,
          success: false,
          message: res.message,
        });
      }
    } catch (e: any) {
      setKeyFeedback({
        id: item.id,
        success: false,
        message: e?.message || "تعذر فحص الاتصال",
      });
    } finally {
      setTestingKeyId(null);
    }
  };

  const handleSaveNewKey = async () => {
    const trimmedKey = newKeyInput.trim();
    if (!trimmedKey) {
      setAddKeyError("يرجى إدخال قيمة مفتاح API");
      return;
    }
    setIsSavingKey(true);
    setAddKeyError(null);
    setNewKeyTestFeedback(null);
    try {
      // Automatic validation test upon save
      const testRes = await testKeyConnection(trimmedKey);
      if (!testRes.success) {
        setAddKeyError(testRes.message || "المفتاح غير صالح أو تعذر الاتصال به");
        setNewKeyTestFeedback(testRes);
        setIsSavingKey(false);
        return;
      }
      
      await addManagedKey(trimmedKey, newKeyLabel.trim() || undefined);
      setShowAddKeyDialog(false);
      setNewKeyInput("");
      setNewKeyLabel("");
      setNewKeyTestFeedback(null);
      const updated = await loadManagedKeysAsync();
      setManagedKeys(updated);
    } catch (err: any) {
      setAddKeyError(err.message || "حدث خطأ أثناء حفظ المفتاح");
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleConfirmDeleteKey = async () => {
    if (!keyToDelete) return;
    try {
      await deleteManagedKey(keyToDelete.id);
      setKeyToDelete(null);
      const updated = await loadManagedKeysAsync();
      setManagedKeys(updated);
    } catch (err) {
      console.error("Failed to delete key:", err);
    }
  };

  const handleReactivateKey = async (id: string) => {
    await updateManagedKey(id, {
      status: "active",
      rateLimitedAt: undefined,
    });
    const updated = await loadManagedKeysAsync();
    setManagedKeys(updated);
  };

  // إحصائيات الدار
  const totalNotesCount = notes.length;
  const totalWordsCount = notes.reduce((sum, n) => {
    const words = n.content?.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length || 0;
    return sum + words;
  }, 0);

  useEffect(() => {
    const lockState = localStorage.getItem("dar_app_lock_enabled") === "true";
    setIsLocked(lockState);

    const handleLockChanged = (e: Event) => {
      const customEvt = e as CustomEvent<{ enabled: boolean }>;
      if (customEvt.detail !== undefined) {
        setIsLocked(customEvt.detail.enabled);
      }
    };

    window.addEventListener("dar_app_lock_changed", handleLockChanged);
    return () => {
      window.removeEventListener("dar_app_lock_changed", handleLockChanged);
    };
  }, []);

  const toggleLock = async () => {
    if (!isLocked) {
      try {
        const registered = await registerWindowsHelloCredential();
        if (!registered) return;
        localStorage.setItem("dar_app_lock_enabled", "true");
        setIsLocked(true);
        window.dispatchEvent(
          new CustomEvent("dar_app_lock_changed", { detail: { enabled: true, authenticated: true } })
        );
      } catch (err) {
        console.warn("Windows Hello enrollment cancelled or failed", err);
      }
    } else {
      const authenticated = await authenticateWithWindowsHello();
      if (!authenticated) return;
      localStorage.setItem("dar_app_lock_enabled", "false");
      setIsLocked(false);
      window.dispatchEvent(
        new CustomEvent("dar_app_lock_changed", { detail: { enabled: false, authenticated: true } })
      );
    }
  };

  // تحديد تلقائي للموقع
  const handleAutoDetect = useCallback(async () => {
    setIsDetecting(true);
    try {
      const location = await autoDetectLocation();
      if (location) {
        updatePrayerState({ location });
        await schedulePrayerAlarms(location, prayerState.method || "egyptian");
      }
    } catch (e) {
      console.error("Auto detect failed:", e);
    } finally {
      setIsDetecting(false);
    }
  }, [prayerState.method, updatePrayerState]);

  // اختيار مدينة يدويًا
  const handleSelectCity = useCallback(
    async (city: CityData) => {
      const location = cityToLocation(city);
      updatePrayerState({ location });
      setShowCityPicker(false);
      setCitySearch("");
      await schedulePrayerAlarms(location, prayerState.method || "egyptian");
    },
    [prayerState.method, updatePrayerState]
  );

  // تصدير نسخة احتياطية من الحكايات عبر downloadBlob الداعم للأندرويد
  const handleExportBackup = async () => {
    try {
      const blob = await StorageService.exportFullBackupBlob();
      const exportFileDefaultName = `دار_الحكايات_نسخة_احتياطية_${new Date().toISOString().slice(0, 10)}.json`;
      await downloadBlob(blob, exportFileDefaultName);
    } catch (err) {
      console.error("Export backup error:", err);
      alert("حدث خطأ أثناء تصدير النسخة الاحتياطية.");
    }
  };

  const handleCancelImport = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // استيراد نسخة احتياطية عبر StorageService.importBatch مع دعم التظليل والإلغاء
  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        
        if (Array.isArray(parsed)) {
          const validNotes = parsed.filter((item: any) => item && (item.title || item.content));

          if (validNotes.length > 0) {
            abortControllerRef.current = new AbortController();
            setIsImporting(true);
            setImportProgress({ processed: 0, total: validNotes.length });

            const result = await StorageService.importBatch(
              validNotes,
              (processed, total) => {
                setImportProgress({ processed, total });
              },
              abortControllerRef.current.signal
            );

            if (result.imported.length > 0) {
              importNotesBulk(result.imported as any);
            }

            setIsImporting(false);
            setImportResult({
              isOpen: true,
              imported: result.imported.length,
              failed: result.failed,
              isCancelled: result.isCancelled,
            });
          } else {
            alert("لم يتم العثور على حكايات صالحة في الملف");
          }
        } else {
          alert("صيغة الملف غير صالحة (يجب أن يكون مصفوفة)");
        }
      } catch (err) {
        console.error("Import error:", err);
        setIsImporting(false);
        alert("تعذر قراءة أو تحليل ملف النسخة الاحتياطية");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    
    reader.onerror = () => {
      setIsImporting(false);
      alert("حدث خطأ أثناء قراءة الملف");
    };

    reader.readAsText(file);
  };

  // المدن المفلترة
  const filteredCities = CITIES.filter(
    (c) => c.nameAr.includes(citySearch) || c.countryAr.includes(citySearch)
  );
  const groupedCities: Record<string, CityData[]> = {};
  for (const city of filteredCities) {
    if (!groupedCities[city.countryAr]) groupedCities[city.countryAr] = [];
    groupedCities[city.countryAr].push(city);
  }

  // ثيمات دار الحكايات (كلاسيكي ملكي، همس الليالي، وداكن آبل) بتصميم الكبسولة الموحدة
  const themesCapsuleList: {
    id: ThemeMode;
    label: string;
  }[] = [
    {
      id: "royal_classic",
      label: "كلاسيكى •",
    },
    {
      id: "night_whisper",
      label: "• ليلى",
    },
    {
      id: "apple_dark",
      label: "داكن آبل",
    },
  ];

  return (
    <div
      className="min-h-screen relative font-sans transition-colors duration-500 flex flex-col"
      dir="rtl"
      style={{ backgroundColor: currentTheme.bg, color: currentTheme.text }}
    >
      {/* --- Apple Top Vignette Effect (Subtle Ambient Shadow Backdrop) --- */}
      <div
        className={`pointer-events-none transition-opacity duration-500 z-30 ${
          currentTheme.mode === "royal_classic"
            ? "apple-top-vignette-light"
            : currentTheme.mode === "night_whisper"
            ? "apple-top-vignette-night"
            : "apple-top-vignette"
        }`}
      />

      {/* --- Apple Magnetic Blur Scroll Dissolve (Effect 2) --- */}
      <div className="apple-magnetic-dissolve" />

      {/* ─── Floating Capsule Header System ─── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 pointer-events-none"
        style={{ top: 0, paddingTop: "16px", paddingBottom: "8px", paddingLeft: "16px", paddingRight: "16px" }}
      >
        <div className="w-full max-w-5xl lg:max-w-7xl mx-auto flex items-center justify-between pointer-events-none px-2 sm:px-4 lg:px-6">
          {/* Right Capsule: Settings Title */}
          <div
            className="pointer-events-auto h-11 px-5 border-[0.5px] flex items-center justify-center backdrop-blur-xl transition-all duration-300"
            style={{
              backgroundColor: currentTheme.mode === "apple_dark" ? "#1C1C1E" : currentTheme.glass,
              borderColor: currentTheme.mode === "apple_dark" ? "rgba(255, 255, 255, 0.08)" : currentTheme.border,
              boxShadow: currentTheme.mode === "apple_dark"
                ? "0 4px 30px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.6)"
                : currentTheme.shadow,
              borderRadius: "9999px",
            }}
          >
            <h1
              className="font-zain-xbold text-base md:text-lg leading-none pt-0.5"
              style={{ color: currentTheme.text }}
            >
              إعدادات دار الحكايات
            </h1>
          </div>

          {/* Left Capsule: Exit Button */}
          <div className="pointer-events-auto flex-shrink-0">
            <button
              onClick={backToHome}
              className="border-[0.5px] flex items-center justify-center backdrop-blur-xl transition-all duration-300 hover:scale-105 active:scale-95 group flex-shrink-0 aspect-square cursor-pointer"
              style={{
                width: "44px",
                height: "44px",
                minWidth: "44px",
                minHeight: "44px",
                backgroundColor: currentTheme.mode === "apple_dark" ? "#1C1C1E" : currentTheme.glass,
                borderColor: currentTheme.mode === "apple_dark" ? "rgba(255, 255, 255, 0.08)" : currentTheme.border,
                boxShadow: currentTheme.mode === "apple_dark"
                  ? "0 4px 30px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.6)"
                  : currentTheme.shadow,
                borderRadius: "50%",
              }}
              title="العودة للرئيسية"
              aria-label="العودة"
            >
              <ChevronRight
                className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                style={{ color: currentTheme.accent }}
                strokeWidth={2.5}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div
        className="settings-page-content px-4 sm:px-6 lg:px-8 flex-1 z-10 relative w-full max-w-5xl lg:max-w-7xl mx-auto flex flex-col"
      >
        <div className="settings-grid grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 w-full">
          {/* ─── 1. أجواء وثيمات الدار ─── */}
          <div
            id="settings-card-theme"
            className="settings-card border transition-all flex flex-col justify-center"
            style={{
              backgroundColor: currentTheme.glass,
              borderColor: currentTheme.border,
              borderRadius: "32px",
              padding: "20px 24px",
              boxShadow: `0 8px 32px -8px ${currentTheme.shadow}`,
            }}
          >
            <div className="flex items-center justify-between mb-3.5 px-1">
              <span
                className="font-zain-bold text-sm md:text-base flex items-center gap-1.5"
                style={{ color: currentTheme.accent }}
              >
                أجواء الدار
              </span>
              <span
                className="text-xs md:text-sm font-zain-reg opacity-70"
                style={{ color: currentTheme.text }}
              >
                {currentTheme.mode === "royal_classic"
                  ? "كلاسيكي ملكي"
                  : currentTheme.mode === "night_whisper"
                  ? "همس الليالي"
                  : "داكن آبل"}
              </span>
            </div>

            {/* شريط الكبسولات الموحد */}
            <div
              className="w-full p-1 border flex items-center justify-between transition-all duration-300 relative"
              style={{
                backgroundColor: currentTheme.mode === "royal_classic"
                  ? "rgba(18, 26, 27, 0.05)"
                  : "rgba(0, 0, 0, 0.4)",
                borderColor: currentTheme.mode === "royal_classic"
                  ? "rgba(18, 26, 27, 0.12)"
                  : "rgba(255, 255, 255, 0.08)",
                borderRadius: "9999px",
                height: "48px",
              }}
            >
              {themesCapsuleList.map((t) => {
                const isActive = currentTheme.mode === t.id;

                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      toggleTheme(t.id);
                    }}
                    className="flex-1 h-full rounded-full font-zain-bold text-sm sm:text-base transition-all duration-300 flex items-center justify-center cursor-pointer active:scale-95 whitespace-nowrap select-none px-2 gap-1"
                    style={{
                      backgroundColor: isActive
                        ? (currentTheme.mode === "apple_dark" ? "#2C2C2E" : currentTheme.accent)
                        : "transparent",
                      color: isActive
                        ? "#FFFFFF"
                        : (currentTheme.mode === "royal_classic"
                            ? "rgba(18, 26, 27, 0.65)"
                            : "rgba(245, 245, 245, 0.65)"),
                      boxShadow: isActive
                        ? (currentTheme.mode === "apple_dark"
                            ? "0 2px 8px rgba(0,0,0,0.5)"
                            : `0 4px 14px -2px ${currentTheme.shadow || "rgba(0,0,0,0.25)"}`)
                        : "none",
                      border: isActive && currentTheme.mode === "apple_dark"
                        ? "1px solid rgba(255, 255, 255, 0.15)"
                        : "none",
                    }}
                  >
                    <span className="leading-none pt-0.5">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ─── 2. محراب المواقيت (الموقع) ─── */}
          <div
            id="settings-card-location"
            className="settings-card border transition-all flex flex-col justify-center"
            style={{
              backgroundColor: currentTheme.glass,
              borderColor: currentTheme.border,
              borderRadius: "32px",
              padding: "20px 24px",
              boxShadow: `0 8px 32px -8px ${currentTheme.shadow}`,
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className="w-12 h-12 flex items-center justify-center border flex-shrink-0"
                  style={{
                    backgroundColor: `${currentTheme.accent}10`,
                    borderColor: `${currentTheme.accent}20`,
                    borderRadius: "50%",
                  }}
                >
                  <MapPin className="w-5 h-5" style={{ color: currentTheme.accent }} />
                </div>
                <div className="flex flex-col text-right min-w-0">
                  <span
                    className="font-zain-bold text-sm leading-tight"
                    style={{ color: currentTheme.text }}
                  >
                    موقع الصلاة
                  </span>
                  <span
                    className="font-zain-reg text-xs opacity-60 mt-1 leading-tight truncate"
                    style={{ color: currentTheme.text }}
                  >
                    {prayerState.location
                      ? `${prayerState.location.cityNameAr || prayerState.location.cityName}`
                      : "تحديد الموقع..."}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={openLocationSheet}
                  className="h-8 px-3.5 rounded-full border text-xs font-zain-bold transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                  style={{
                    backgroundColor: `${currentTheme.accent}10`,
                    borderColor: `${currentTheme.accent}30`,
                    color: currentTheme.accent,
                    whiteSpace: "nowrap",
                  }}
                >
                  تغيير
                </button>
                <button
                  onClick={handleAutoDetect}
                  disabled={isDetecting}
                  className="w-8 h-8 rounded-full border transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                  style={{
                    backgroundColor: `${currentTheme.bg}80`,
                    borderColor: currentTheme.border,
                    color: currentTheme.accent,
                  }}
                >
                  {isDetecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Compass className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ─── 3. مفاتيح المساعد الأدبي ─── */}
          <div
            id="settings-card-assistant-keys"
            className="settings-card border transition-all flex flex-col gap-4 justify-center"
            style={{
              backgroundColor: currentTheme.glass,
              borderColor: currentTheme.border,
              borderRadius: "32px",
              padding: "20px 24px",
              boxShadow: `0 8px 32px -8px ${currentTheme.shadow}`,
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className="w-12 h-12 flex items-center justify-center border flex-shrink-0"
                  style={{
                    backgroundColor: `${currentTheme.accent}10`,
                    borderColor: `${currentTheme.accent}20`,
                    borderRadius: "50%",
                  }}
                >
                  <KeyRound className="w-5 h-5" style={{ color: currentTheme.accent }} />
                </div>
                <div className="flex flex-col text-right min-w-0">
                  <span
                    className="font-zain-bold text-sm leading-tight"
                    style={{ color: currentTheme.text }}
                  >
                    مفاتيح المساعد
                  </span>
                  <span
                    className="font-zain-reg text-xs opacity-60 mt-1 leading-tight"
                    style={{ color: currentTheme.text }}
                  >
                    {managedKeys.length > 0 ? `${managedKeys.length} مفاتيح مُضافة` : "تبديل تلقائي للمفاتيح"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setAddKeyError(null);
                  setNewKeyInput("");
                  setNewKeyLabel("");
                  setShowAddKeyDialog(true);
                }}
                className="w-9 h-9 rounded-full border transition-all active:scale-95 flex items-center justify-center cursor-pointer flex-shrink-0"
                style={{
                  backgroundColor: `${currentTheme.accent}10`,
                  borderColor: `${currentTheme.accent}30`,
                  color: currentTheme.accent,
                }}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* List of Collapsed Key Cards / Empty State */}
            {managedKeys.length > 0 && (
              <div className="flex flex-col gap-2">
                {managedKeys.slice(0, 2).map((item) => {
                  const isActive = item.status === "active";
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2.5 border rounded-2xl transition-all"
                      style={{
                        backgroundColor: `${currentTheme.bg}70`,
                        borderColor: currentTheme.border,
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-6 h-6 flex items-center justify-center border rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: `${currentTheme.accent}10`,
                            borderColor: `${currentTheme.accent}25`,
                          }}
                        >
                          <KeyRound className="w-3 h-3" style={{ color: currentTheme.accent }} />
                        </div>
                        <span
                          className="font-zain-bold text-xs truncate"
                          style={{ color: currentTheme.text }}
                        >
                          {item.label || "مفتاح API"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        )}
                        <button
                          onClick={() => setKeyToDelete(item)}
                          className="p-1 rounded-full opacity-50 hover:opacity-100 hover:text-red-500 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {managedKeys.length > 2 && (
                  <div className="text-center text-[10px] font-zain-bold opacity-50 mt-1">
                    +{managedKeys.length - 2} مفاتيح أخرى
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── 4. أرشيف المخطوطات والنسخ الاحتياطي ─── */}
          <div
            id="settings-card-archive"
            className="settings-card border transition-all flex flex-col gap-4 justify-center"
            style={{
              backgroundColor: currentTheme.glass,
              borderColor: currentTheme.border,
              borderRadius: "32px",
              padding: "20px 24px",
              boxShadow: `0 8px 32px -8px ${currentTheme.shadow}`,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className="w-12 h-12 flex items-center justify-center border flex-shrink-0"
                  style={{
                    backgroundColor: `${currentTheme.accent}10`,
                    borderColor: `${currentTheme.accent}20`,
                    borderRadius: "50%",
                  }}
                >
                  <Download className="w-5 h-5" style={{ color: currentTheme.accent }} />
                </div>
                <div className="flex flex-col text-right min-w-0">
                  <span
                    className="font-zain-bold text-sm leading-tight"
                    style={{ color: currentTheme.text }}
                  >
                    أرشيف الحكايات
                  </span>
                  <span
                    className="font-zain-reg text-xs opacity-60 mt-1 leading-tight"
                    style={{ color: currentTheme.text }}
                  >
                    {totalNotesCount} حكاية • {totalWordsCount.toLocaleString("ar-EG")} كلمة
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportBackup}
                disabled={isImporting}
                className="flex-1 h-9 rounded-full font-zain-bold text-xs border transition-all active:scale-95 flex items-center justify-center cursor-pointer gap-2 disabled:opacity-50"
                style={{
                  backgroundColor: `${currentTheme.accent}10`,
                  borderColor: `${currentTheme.accent}30`,
                  color: currentTheme.accent,
                }}
              >
                <Download className="w-3.5 h-3.5" />
                <span>تصدير</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="flex-1 h-9 rounded-full font-zain-bold text-xs border transition-all active:scale-95 flex items-center justify-center cursor-pointer gap-2 disabled:opacity-50"
                style={{
                  backgroundColor: isImporting ? `${currentTheme.accent}20` : `${currentTheme.bg}80`,
                  borderColor: isImporting ? currentTheme.accent : currentTheme.border,
                  color: currentTheme.text,
                }}
              >
                {isImporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" style={{ color: currentTheme.accent }} />
                )}
                <span>{isImporting ? "جاري الاستيراد..." : "استيراد"}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>

            {importStatus && (
              <div 
                className="text-[10px] font-zain-bold text-center animate-in fade-in slide-in-from-top-1"
                style={{ color: importStatus.includes("نجاح") ? "#10B981" : currentTheme.accent }}
              >
                {importStatus}
              </div>
            )}
          </div>

          {/* ─── 5. قفل الدار بالبصمة ─── */}
          <div
            id="settings-card-security"
            className="settings-card border transition-all flex flex-col justify-center"
            style={{
              backgroundColor: currentTheme.glass,
              borderColor: currentTheme.border,
              borderRadius: "32px",
              padding: "20px 24px",
              boxShadow: `0 8px 32px -8px ${currentTheme.shadow}`,
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className="w-12 h-12 flex items-center justify-center border flex-shrink-0 transition-colors"
                  style={{
                    backgroundColor: isLocked ? `${currentTheme.accent}15` : `${currentTheme.accent}05`,
                    borderColor: isLocked ? `${currentTheme.accent}30` : currentTheme.border,
                    borderRadius: "50%",
                  }}
                >
                  {isLocked ? (
                    <Lock className="w-5 h-5" style={{ color: currentTheme.accent }} />
                  ) : (
                    <Unlock className="w-5 h-5 opacity-40" style={{ color: currentTheme.text }} />
                  )}
                </div>
                <div className="flex flex-col text-right min-w-0">
                  <span
                    className="font-zain-bold text-sm leading-tight"
                    style={{ color: currentTheme.text }}
                  >
                    قفل الدار
                  </span>
                  <span
                    className="font-zain-reg text-xs opacity-60 mt-1 leading-tight"
                    style={{ color: currentTheme.text }}
                  >
                    تأمين الحكايات ببصمة Windows Hello أو PIN
                  </span>
                </div>
              </div>

              <button
                onClick={toggleLock}
                className="w-12 h-6 relative transition-colors duration-300 cursor-pointer flex-shrink-0 border p-0.5"
                style={{
                  backgroundColor: isLocked ? currentTheme.accent : `${currentTheme.border}`,
                  borderColor: isLocked ? currentTheme.accent : currentTheme.border,
                  borderRadius: "9999px",
                }}
                aria-label="تبديل قفل التطبيق"
              >
                <div
                  className={`w-5 h-5 bg-white transition-all duration-300 shadow-md flex items-center justify-center ${
                    isLocked ? "mr-auto ml-0" : "ml-auto mr-0"
                  }`}
                  style={{ borderRadius: "50%" }}
                >
                  {isLocked && <Check className="w-3 h-3 text-[#2C3E30] stroke-[3]" />}
                </div>
              </button>
            </div>
          </div>

          {/* ─── 6. تحديثات التطبيق (OTA) ─── */}
          <div
            id="settings-card-updates"
            className="settings-card border transition-all flex flex-col justify-center"
            style={{
              backgroundColor: currentTheme.glass,
              borderColor: currentTheme.border,
              borderRadius: "32px",
              padding: "20px 24px",
              boxShadow: `0 8px 32px -8px ${currentTheme.shadow}`,
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className="w-12 h-12 flex items-center justify-center border flex-shrink-0 relative"
                  style={{
                    backgroundColor: `${currentTheme.accent}10`,
                    borderColor: `${currentTheme.accent}20`,
                    borderRadius: "50%",
                  }}
                >
                  <Smartphone className="w-5 h-5" style={{ color: currentTheme.accent }} />
                  {appVersion && (
                    <div
                      className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border flex items-center justify-center shadow-sm"
                      style={{
                        backgroundColor: currentTheme.bg,
                        borderColor: currentTheme.border,
                      }}
                    >
                      <Sparkles className="w-2.5 h-2.5" style={{ color: currentTheme.accent }} />
                    </div>
                  )}
                </div>
                <div className="flex flex-col text-right min-w-0">
                  <span
                    className="font-zain-bold text-sm leading-tight"
                    style={{ color: currentTheme.text }}
                  >
                    تحديثات التطبيق
                  </span>
                  <span
                    className="font-zain-reg text-xs opacity-60 mt-1 leading-tight"
                    style={{ color: currentTheme.text }}
                  >
                    الإصدار {appVersion ? appVersion.versionName : "الحالي"}
                  </span>
                </div>
              </div>
              <button
                onClick={handleCheckUpdateNow}
                disabled={isCheckingUpdate}
                className="h-8 px-3.5 rounded-full border text-xs font-zain-bold transition-all active:scale-95 flex items-center justify-center cursor-pointer gap-1.5 flex-shrink-0"
                style={{
                  backgroundColor: `${currentTheme.accent}10`,
                  borderColor: `${currentTheme.accent}30`,
                  color: currentTheme.accent,
                  opacity: isCheckingUpdate ? 0.7 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {isCheckingUpdate ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>فحص</span>
              </button>
            </div>
            
            {updateFeedback && (
              <div
                className="mt-4 flex items-center gap-2 px-3 py-2 rounded-2xl text-[11px] font-zain-bold border animate-in fade-in"
                style={{
                  backgroundColor: updateFeedback.success
                    ? "rgba(16, 185, 129, 0.08)"
                    : "rgba(239, 68, 68, 0.08)",
                  borderColor: updateFeedback.success
                    ? "rgba(16, 185, 129, 0.25)"
                    : "rgba(239, 68, 68, 0.25)",
                  color: updateFeedback.success ? "#059669" : "#dc2626",
                }}
              >
                {updateFeedback.success ? (
                  updateFeedback.isLatest ? (
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  ) : (
                    <ArrowUpCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  )
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                )}
                <span className="leading-tight">{updateFeedback.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* ─── الفوتر الرقيق ─── */}
        <div className="text-center pt-2 opacity-50">
          <p className="font-zain-reg text-[11px]" style={{ color: currentTheme.text }}>
            دَارُ الحِكَايَاتِ والمِحْرَابُ • حيث يجتمع الأدب والسكينة
          </p>
        </div>
      </div>

      {/* ─── نافذة تقدم الاستيراد مع زر الإلغاء ─── */}
      {isImporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-sm rounded-[28px] border shadow-2xl p-6 flex flex-col items-center text-center gap-4"
            style={{
              backgroundColor: currentTheme.bg,
              borderColor: currentTheme.border,
              color: currentTheme.text,
            }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center animate-spin"
              style={{ backgroundColor: `${currentTheme.accent}15`, color: currentTheme.accent }}
            >
              <RefreshCw className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-zain-bold text-lg" style={{ color: currentTheme.accent }}>
                جاري استيراد الحكايات إلى قاعدة البيانات...
              </h3>
              <p className="font-zain-reg text-xs opacity-75 mt-1">
                تمت معالجة {importProgress.processed} من {importProgress.total} حكاية
              </p>
            </div>
            <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full transition-all duration-200 rounded-full"
                style={{
                  width: `${Math.round((importProgress.processed / (importProgress.total || 1)) * 100)}%`,
                  backgroundColor: currentTheme.accent,
                }}
              />
            </div>
            <button
              onClick={handleCancelImport}
              className="mt-2 px-6 py-2 rounded-full font-zain-bold text-xs border border-red-500/30 text-red-500 hover:bg-red-500/10 active:scale-95 transition-all cursor-pointer"
            >
              إلغاء الاستيراد
            </button>
          </div>
        </div>
      )}

      {/* ─── مودال نتيجة الاستيراد ─── */}
      <ImportResultModal
        isOpen={importResult.isOpen}
        onClose={() => setImportResult({ isOpen: false, imported: 0, failed: [] })}
        importedCount={importResult.imported}
        failedItems={importResult.failed}
        isCancelled={importResult.isCancelled}
        theme={currentTheme}
      />

      {/* ─── نافذة اختيار المدينة السلسة (Bottom Sheet) ─── */}
      {showCityPicker && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="w-full max-w-md border-t shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300"
            style={{
              backgroundColor: currentTheme.bg,
              borderColor: currentTheme.border,
              borderTopLeftRadius: "28px",
              borderTopRightRadius: "28px",
              maxHeight: "80vh",
            }}
          >
            {/* رأس النافذة */}
            <div
              className="p-4 border-b flex items-center justify-between"
              style={{ borderColor: currentTheme.border }}
            >
              <h3
                className="font-zain-xbold text-base"
                style={{ color: currentTheme.text }}
              >
                اختيار المدينة
              </h3>
              <button
                onClick={() => {
                  setShowCityPicker(false);
                  setCitySearch("");
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
                style={{ color: currentTheme.text }}
              >
                ✕
              </button>
            </div>

            {/* حقل البحث */}
            <div className="px-4 pt-3">
              <input
                type="text"
                value={citySearch}
                onChange={(e) => setCitySearch(e.target.value)}
                placeholder="ابحث عن مدينة أو محافظة..."
                className="w-full border text-xs font-zain-reg outline-none focus:ring-2 transition-all"
                style={{
                  backgroundColor: `${currentTheme.bg}80`,
                  borderColor: currentTheme.border,
                  color: currentTheme.text,
                  borderRadius: "9999px",
                  padding: "8px 14px",
                }}
                autoFocus
              />
            </div>

            {/* قائمة المدن */}
            <div
              className="overflow-y-auto p-4 flex flex-col gap-3"
              style={{ maxHeight: "calc(80vh - 130px)" }}
            >
              {Object.entries(groupedCities).map(([country, cities]) => (
                <div key={country}>
                  <h4
                    className="font-zain-bold text-[10px] opacity-50 mb-1.5 tracking-wider"
                    style={{ color: currentTheme.accent }}
                  >
                    {country}
                  </h4>
                  <div className="flex flex-col gap-1">
                    {cities.map((city) => (
                      <button
                        key={`${city.nameAr}-${city.countryAr}`}
                        onClick={() => handleSelectCity(city)}
                        className="w-full text-right transition-all active:scale-[0.98] hover:bg-black/5 p-2 rounded-xl cursor-pointer"
                        style={{ color: currentTheme.text }}
                      >
                        <span className="font-zain-reg text-xs">
                          {city.nameAr}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {filteredCities.length === 0 && (
                <p className="text-center font-zain-reg text-xs opacity-50 py-6">
                  لم يتم العثور على مدينة
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── نافذة منبثقة لإضافة مفتاح جديد (Add API Key Dialog) ─── */}
      {showAddKeyDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="border flex flex-col items-center animate-in zoom-in-95 duration-200"
            style={{
              width: "300px",
              maxWidth: "calc(100vw - 32px)",
              borderRadius: "28px",
              padding: "24px 20px",
              backgroundColor: currentTheme.bg,
              borderColor: currentTheme.border,
              boxShadow: `0 20px 45px -10px ${currentTheme.shadow || "rgba(0,0,0,0.3)"}`,
            }}
          >
            {/* Top Icon matching Story Lock Dialog */}
            <div className="flex justify-center mb-3">
              <KeyRound
                className="w-7 h-7"
                style={{ color: currentTheme.accent }}
                strokeWidth={2}
              />
            </div>

            {/* Dialog Title */}
            <h2
              className="text-base font-zain-xbold mb-1 leading-tight text-center"
              style={{ color: currentTheme.text }}
            >
              إضافة مفتاح جديد
            </h2>

            {/* Description */}
            <p
              className="text-xs font-zain-reg mb-4 opacity-70 leading-relaxed text-center px-1"
              style={{ color: currentTheme.text }}
            >
              أدخلي مفتاح Gemini API للمساعد الأدبي لضمان استمرار الاتصال والتبديل التلقائي.
            </p>

            {/* Input 1: API Key */}
            <div className="mb-4 w-full flex flex-col">
              <input
                type="text"
                placeholder="قيمة مفتاح API (مثال: AIzaSy...)"
                value={newKeyInput}
                onChange={(e) => {
                  setNewKeyInput(e.target.value);
                  if (addKeyError) setAddKeyError(null);
                }}
                autoFocus
                dir="ltr"
                className="w-full text-center font-mono text-xs outline-none border transition-all"
                style={{
                  height: "42px",
                  borderRadius: "9999px",
                  backgroundColor: `${currentTheme.accent}0a`,
                  borderColor: `${currentTheme.accent}40`,
                  color: currentTheme.text,
                  padding: "0 16px",
                }}
              />
            </div>

            {/* Input 2: Optional Label */}
            <div className="mb-3.5 w-full flex flex-col">
              <input
                type="text"
                placeholder="تسمية المفتاح (اختياري، مثلاً: مفتاح 1)"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                className="w-full text-center font-zain-bold text-xs outline-none border transition-all"
                style={{
                  height: "42px",
                  borderRadius: "9999px",
                  backgroundColor: `${currentTheme.accent}0a`,
                  borderColor: `${currentTheme.accent}40`,
                  color: currentTheme.text,
                  padding: "0 16px",
                }}
              />
            </div>

            {/* Testing feedback */}
            {newKeyTestFeedback && (
              <div
                className="mb-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-zain-bold border animate-in fade-in"
                style={{
                  backgroundColor: newKeyTestFeedback.success
                    ? "rgba(16, 185, 129, 0.1)"
                    : "rgba(239, 68, 68, 0.1)",
                  borderColor: newKeyTestFeedback.success
                    ? "rgba(16, 185, 129, 0.3)"
                    : "rgba(239, 68, 68, 0.3)",
                  color: newKeyTestFeedback.success ? "#059669" : "#dc2626",
                }}
              >
                {newKeyTestFeedback.success ? (
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                )}
                <span className="leading-tight text-center">{newKeyTestFeedback.message}</span>
              </div>
            )}

            {addKeyError && !newKeyTestFeedback && (
              <div className="mb-3 text-[11px] font-zain-bold text-red-500 text-center leading-tight">
                {addKeyError}
              </div>
            )}

            {/* Action Buttons - Capsule Pill Buttons matching Story Lock Dialog */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleSaveNewKey}
                disabled={isSavingKey}
                className="font-zain-bold text-xs shadow-sm active:scale-95 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
                style={{
                  height: "34px",
                  padding: "0 22px",
                  borderRadius: "9999px",
                  backgroundColor: currentTheme.accent,
                  color: currentTheme.bg,
                  whiteSpace: "nowrap",
                }}
              >
                {isSavingKey ? "جارٍ الفحص والحفظ..." : "حفظ"}
              </button>

              <button
                onClick={() => {
                  setShowAddKeyDialog(false);
                  setNewKeyInput("");
                  setNewKeyLabel("");
                  setAddKeyError(null);
                  setNewKeyTestFeedback(null);
                }}
                disabled={isSavingKey}
                className="font-zain-bold text-xs active:scale-95 transition-all cursor-pointer opacity-70 hover:opacity-100 flex items-center justify-center"
                style={{
                  height: "34px",
                  padding: "0 16px",
                  borderRadius: "9999px",
                  color: currentTheme.secondary,
                  whiteSpace: "nowrap",
                }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── نافذة تأكيد حذف مفتاح (Delete Confirmation Dialog) ─── */}
      {keyToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="border flex flex-col items-center animate-in zoom-in-95 duration-200"
            style={{
              width: "280px",
              maxWidth: "calc(100vw - 32px)",
              borderRadius: "28px",
              padding: "24px 20px",
              backgroundColor: currentTheme.bg,
              borderColor: currentTheme.border,
              boxShadow: `0 20px 45px -10px ${currentTheme.shadow || "rgba(0,0,0,0.3)"}`,
            }}
          >
            {/* Top Icon */}
            <div className="flex justify-center mb-3">
              <Trash2
                className="w-7 h-7"
                style={{ color: "#dc2626" }}
                strokeWidth={2}
              />
            </div>

            {/* Dialog Title */}
            <h2
              className="text-base font-zain-xbold mb-1 leading-tight text-center"
              style={{ color: currentTheme.text }}
            >
              حذف مفتاح الاتصال
            </h2>

            {/* Description */}
            <p
              className="text-xs font-zain-reg mb-4 opacity-70 leading-relaxed text-center px-1"
              style={{ color: currentTheme.text }}
            >
              هل ترغبين في حذف {keyToDelete.label ? `"${keyToDelete.label}"` : "هذا المفتاح"} نهائياً من قائمة مفاتيح المساعد الأدبي؟
            </p>

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleConfirmDeleteKey}
                className="font-zain-bold text-xs text-white shadow-sm active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                style={{
                  height: "34px",
                  padding: "0 22px",
                  borderRadius: "9999px",
                  backgroundColor: "#dc2626",
                  whiteSpace: "nowrap",
                }}
              >
                حذف
              </button>
              <button
                onClick={() => setKeyToDelete(null)}
                className="font-zain-bold text-xs active:scale-95 transition-all cursor-pointer opacity-70 hover:opacity-100 flex items-center justify-center"
                style={{
                  height: "34px",
                  padding: "0 16px",
                  borderRadius: "9999px",
                  color: currentTheme.secondary,
                  whiteSpace: "nowrap",
                }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
