import React, { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "motion/react";
import { BookOpen, Compass, Plus, Feather } from "lucide-react";
import DarAlHikayatMaster from "./components/DarAlHikayatEditor";
import HomePage from "./components/HomePage";
import SplashScreen from "./components/SplashScreen";
import SettingsPage from "./components/SettingsPage";
import PrayerPage from "./components/PrayerPage";
import LocationPickerPage from "./components/LocationPickerPage";
import LocationBottomSheet from "./components/LocationBottomSheet";
import { UpdateDialog } from "./components/UpdateDialog";
import { checkForUpdates, notifyUpdateAvailable, openUpdateDialog } from "./lib/app-updater";
import { AppProvider, useApp } from "./contexts/AppContext";
import {
  schedulePrayerAlarms,
} from "./lib/prayer-alarms";
import { logoAsset } from "./lib/logo-assets";
import RemoteKeyboardMobilePage from "./components/RemoteKeyboardMobilePage";
import { authenticateWithWindowsHello, hasWindowsHelloCredential } from "./lib/windows-auth";

// The main component that manages views and persistent navigation
const AppContent = () => {
  const { currentView, currentTheme, selectedNote, backToHome, openPrayer, openEditor, isSelectionMode } = useApp();

  return (
    <div
      className="App relative min-h-screen w-full transition-colors duration-500"
      style={{ backgroundColor: currentTheme.bg, color: currentTheme.text }}
    >
      {/* ── Main Tab Screens (Persistent to preserve scroll & state) ── */}
      {/* Critical: No CSS transforms (translate-y) allowed here to ensure position:fixed headers stay firmly fixed to the viewport */}
      <div
        className={`w-full min-h-screen transition-opacity duration-300 ease-out ${
          currentView === "home"
            ? "opacity-100 pointer-events-auto block"
            : "opacity-0 pointer-events-none hidden"
        }`}
      >
        <HomePage />
      </div>

      <div
        className={`w-full min-h-screen transition-opacity duration-300 ease-out ${
          currentView === "prayer"
            ? "opacity-100 pointer-events-auto block"
            : "opacity-0 pointer-events-none hidden"
        }`}
      >
        <PrayerPage />
      </div>

      {/* ── Fullscreen Overlay Screens (Apple Shared Transitions) ── */}
      <AnimatePresence mode="wait">
        {currentView === "settings" && (
          <motion.div
            key="settings-screen"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
            className="w-full min-h-screen"
          >
            <SettingsPage />
          </motion.div>
        )}
        {currentView === "editor" && (
          <motion.div
            key={`editor-${selectedNote?.id || "new"}`}
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 14 }}
            transition={{ duration: 0.38, ease: [0.25, 1, 0.5, 1] }}
            onAnimationComplete={() => {
              const el = document.getElementById("editor-motion-container");
              if (el) el.style.transform = "none";
            }}
            id="editor-motion-container"
            className="w-full min-h-screen relative z-50"
          >
            <DarAlHikayatMaster />
          </motion.div>
        )}
        {currentView === "locationPicker" && (
          <motion.div
            key="location-picker-screen"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.32, ease: [0.25, 1, 0.5, 1] }}
            className="w-full min-h-screen"
          >
            <LocationPickerPage />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Global Location Bottom Action Sheet ── */}
      <LocationBottomSheet />

      {/* ── Global In-App Update Dialog ── */}
      <UpdateDialog />

      {/* ── Unified Persistent Floating Bottom Navigation (Centered with Adjacent Circular FAB) ── */}
      <AnimatePresence>
        {(currentView === "home" || currentView === "prayer") && !isSelectionMode && (
          <motion.footer
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{
              duration: 0.45,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="fixed bottom-4 left-0 right-0 z-40 px-4 pointer-events-none flex justify-center items-center gap-3"
          >
            {/* Floating Navigation Capsule */}
            <div
              className="pointer-events-auto h-12 p-1.5 rounded-full border flex items-center gap-1.5 backdrop-blur-2xl transition-all duration-500 ease-out"
              style={{
                borderRadius: "9999px",
                backgroundColor: currentTheme.mode === "apple_dark" ? "#1C1C1E" : currentTheme.glass,
                borderColor: currentTheme.mode === "apple_dark" ? "rgba(255, 255, 255, 0.08)" : currentTheme.border,
                boxShadow: currentTheme.mode === "apple_dark"
                  ? "0 4px 30px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.6)"
                  : currentTheme.shadow,
              }}
            >
              {/* Tab 1: الحكايات */}
              <button
                onClick={backToHome}
                className={`relative h-full flex items-center justify-center gap-2 rounded-full transition-all duration-500 ease-out cursor-pointer apple-elastic-pinch ${
                  currentView === "home"
                    ? "px-4"
                    : "px-3.5 opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
                }`}
                style={{
                  borderRadius: "9999px",
                  color: currentView === "home" ? currentTheme.accent : (currentTheme.mode === "apple_dark" ? "#8E8E93" : currentTheme.text),
                }}
                title="الحكايات"
              >
                {currentView === "home" && (
                  <motion.div
                    layoutId="activeBottomTabPill"
                    className="absolute inset-0 rounded-full border"
                    style={{
                      borderRadius: "9999px",
                      backgroundColor: currentTheme.mode === "apple_dark" ? "#2C2C2E" : `${currentTheme.accent}18`,
                      borderColor: currentTheme.mode === "apple_dark" ? "rgba(255, 255, 255, 0.12)" : `${currentTheme.accent}35`,
                    }}
                    transition={{
                      duration: 0.45,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  />
                )}
                <BookOpen className="w-4 h-4 shrink-0 relative z-10 transition-transform duration-500 ease-out" strokeWidth={2.2} />
                <AnimatePresence mode="popLayout">
                  {currentView === "home" && (
                    <motion.div
                      initial={{ opacity: 0, width: 0, scale: 0.95 }}
                      animate={{ opacity: 1, width: "auto", scale: 1 }}
                      exit={{ opacity: 0, width: 0, scale: 0.95 }}
                      transition={{
                        duration: 0.45,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="relative z-10 overflow-hidden flex items-center"
                    >
                      <span
                        className="font-zain-bold text-xs pt-0.5 whitespace-nowrap pr-0.5"
                        style={{ color: currentTheme.accent }}
                      >
                        الحكايات
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>

              {/* Tab 2: المحراب */}
              <button
                onClick={openPrayer}
                className={`relative h-full flex items-center justify-center gap-2 rounded-full transition-all duration-500 ease-out cursor-pointer apple-elastic-pinch ${
                  currentView === "prayer"
                    ? "px-4"
                    : "px-3.5 opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
                }`}
                style={{
                  borderRadius: "9999px",
                  color: currentView === "prayer" ? currentTheme.accent : (currentTheme.mode === "apple_dark" ? "#8E8E93" : currentTheme.text),
                }}
                title="المحراب"
              >
                {currentView === "prayer" && (
                  <motion.div
                    layoutId="activeBottomTabPill"
                    className="absolute inset-0 rounded-full border"
                    style={{
                      borderRadius: "9999px",
                      backgroundColor: currentTheme.mode === "apple_dark" ? "#2C2C2E" : `${currentTheme.accent}18`,
                      borderColor: currentTheme.mode === "apple_dark" ? "rgba(255, 255, 255, 0.12)" : `${currentTheme.accent}35`,
                    }}
                    transition={{
                      duration: 0.45,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  />
                )}
                <Compass className="w-4 h-4 shrink-0 relative z-10 transition-transform duration-500 ease-out" strokeWidth={2.2} />
                <AnimatePresence mode="popLayout">
                  {currentView === "prayer" && (
                    <motion.div
                      initial={{ opacity: 0, width: 0, scale: 0.95 }}
                      animate={{ opacity: 1, width: "auto", scale: 1 }}
                      exit={{ opacity: 0, width: 0, scale: 0.95 }}
                      transition={{
                        duration: 0.45,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="relative z-10 overflow-hidden flex items-center"
                    >
                      <span
                        className="font-zain-bold text-xs pt-0.5 whitespace-nowrap pr-0.5"
                        style={{ color: currentTheme.accent }}
                      >
                        المحراب
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </div>

            {/* Standalone Circular Floating Action Button (+) right next to capsule */}
            <AnimatePresence>
              {currentView === "home" && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8, x: 8 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8, x: 8 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => openEditor(null)}
                  className="pointer-events-auto w-12 h-12 rounded-full border flex items-center justify-center backdrop-blur-md transition-all duration-300 hover:scale-105 active:scale-95 flex-shrink-0 cursor-pointer apple-elastic-pinch"
                  style={{
                    borderRadius: "9999px",
                    backgroundColor: currentTheme.mode === "apple_dark" ? "#1C1C1E" : (currentTheme.isDark ? "#1C2526" : currentTheme.accent),
                    color: currentTheme.mode === "apple_dark" ? "#F5F5F5" : (currentTheme.isDark ? currentTheme.accent : currentTheme.bg),
                    borderColor: currentTheme.mode === "apple_dark" ? "rgba(255, 255, 255, 0.08)" : (currentTheme.isDark ? "rgba(226, 223, 210, 0.15)" : currentTheme.border),
                    boxShadow: currentTheme.mode === "apple_dark"
                      ? "0 4px 30px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.6)"
                      : currentTheme.shadow,
                  }}
                  title="حكاية جديدة"
                >
                  <Feather className="w-5 h-5" strokeWidth={2.2} />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.footer>
        )}
      </AnimatePresence>
    </div>
  );
};

// Component that handles biometric lock
const BiometricGuard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { currentTheme } = useApp();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isLockEnabled, setIsLockEnabled] = useState(false);
  const isAuthenticatingRef = React.useRef(false);
  const lastAuthenticatedAtRef = React.useRef(0);
  const wasInBackgroundRef = React.useRef(false);

  const authenticate = async () => {
    if (isAuthenticatingRef.current) return;
    isAuthenticatingRef.current = true;
    try {
      const authenticated = await authenticateWithWindowsHello();
      if (authenticated) {
        lastAuthenticatedAtRef.current = Date.now();
        setIsUnlocked(true);
      }
    } finally {
      isAuthenticatingRef.current = false;
    }
  };

  useEffect(() => {
    const checkAndTriggerAuth = () => {
      const lockState = localStorage.getItem("dar_app_lock_enabled") === "true";
      setIsLockEnabled(lockState);

      if (lockState && hasWindowsHelloCredential()) {
        setIsUnlocked(false);
        // The first attempt is best-effort; the lock screen remains available for a user gesture.
        setTimeout(() => { void authenticate(); }, 150);
      } else if (lockState) {
        // Recover safely from the legacy fake lock that had no Windows Hello credential.
        localStorage.setItem("dar_app_lock_enabled", "false");
        setIsLockEnabled(false);
        setIsUnlocked(true);
      } else {
        setIsUnlocked(true);
      }
    };

    checkAndTriggerAuth();

    // Listen for custom event when user toggles lock in Settings
    const handleLockChanged = (e: Event) => {
      const customEvt = e as CustomEvent<{ enabled: boolean; authenticated?: boolean }>;
      const isEnabled = customEvt.detail?.enabled ?? (localStorage.getItem("dar_app_lock_enabled") === "true");
      setIsLockEnabled(isEnabled);
      if (isEnabled) {
        if (customEvt.detail?.authenticated) {
          lastAuthenticatedAtRef.current = Date.now();
          setIsUnlocked(true);
        } else {
          setIsUnlocked(false);
          setTimeout(() => { void authenticate(); }, 100);
        }
      } else {
        setIsUnlocked(true);
      }
    };

    // Listen for visibility change to re-lock only when returning from actual background
    const handleVisibilityChange = () => {
      const lockEnabled = localStorage.getItem("dar_app_lock_enabled") === "true";
      if (!lockEnabled) return;

      if (document.visibilityState === "hidden") {
        wasInBackgroundRef.current = true;
      } else if (document.visibilityState === "visible") {
        // If we are currently in the middle of authenticating (e.g. system dialog just closed), do NOT re-lock!
        if (isAuthenticatingRef.current) return;
        // If unlocked within the last 2.5 seconds, do NOT re-lock!
        if (Date.now() - lastAuthenticatedAtRef.current < 2500) return;

        if (wasInBackgroundRef.current) {
          wasInBackgroundRef.current = false;
          setIsUnlocked(false);
          setTimeout(() => { void authenticate(); }, 150);
        }
      }
    };

    window.addEventListener("dar_app_lock_changed", handleLockChanged);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("dar_app_lock_changed", handleLockChanged);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  if (isLockEnabled && !isUnlocked) {
    // Pure Clean Lock Screen - NO manual unlock button, auto native prompt & tap-to-retry
    return (
      <div
        onClick={() => authenticate()}
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center transition-all duration-500 cursor-pointer select-none"
        style={{ backgroundColor: currentTheme.bg }}
        dir="rtl"
      >
        <div className="flex flex-col items-center justify-center max-w-sm w-full p-8 text-center space-y-6 pointer-events-none">
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center border backdrop-blur-2xl transition-all duration-300 animate-pulse"
            style={{
              backgroundColor: currentTheme.glass,
              borderColor: currentTheme.border,
              boxShadow: `0 12px 32px -4px ${currentTheme.shadow || "rgba(0,0,0,0.15)"}`,
            }}
          >
            <img
              src={
                logoAsset(currentTheme.mode)
              }
              alt="Logo"
              className="w-16 h-16 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>

          <div className="space-y-2">
            <h2
              className="text-2xl font-zain-bold tracking-wide"
              style={{ color: currentTheme.text }}
            >
              التطبيق مقفل
            </h2>
            <p
              className="text-sm font-zain-reg opacity-60"
              style={{ color: currentTheme.text }}
            >
              المصادقة Windows Hello بالبصمة أو PIN
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// The root component that wraps everything with the provider
function App() {
  const [showSplash, setShowSplash] = useState(true);

  // The native window stays hidden until React has mounted the real app.
  // This prevents WebView2's transient ERR_FAILED page from ever being shown.
  useEffect(() => {
    if (window.location.hostname === "tauri.localhost") {
      void invoke<boolean>("is_silent_process").then((silentProcess) => {
        if (!silentProcess) {
          void getCurrentWindow().show();
          return;
        }
        void invoke<boolean>("is_prayer_refresh_process").then((refreshProcess) => {
          if (refreshProcess) window.setTimeout(() => void invoke("exit_silent_process"), 15_000);
        });
      });
    }
  }, []);

  // Standalone Mobile Remote Keyboard View
  const isRemoteKeyboard =
    typeof window !== "undefined" &&
    (window.location.hash.includes("remote-keyboard") ||
      window.location.pathname.includes("remote-keyboard") ||
      window.location.search.includes("remote-keyboard"));

  if (isRemoteKeyboard) {
    return <RemoteKeyboardMobilePage />;
  }

  useEffect(() => {
    if (!showSplash) {
      const checkAndPresentUpdate = async (force = false) => {
        try {
          const result = await checkForUpdates({ manual: false, force });
          if (result.hasUpdate && result.latestInfo && result.currentVersion) {
            await notifyUpdateAvailable(result.latestInfo);
            openUpdateDialog(result.latestInfo, result.currentVersion, result.isMandatory);
          }
        } catch (err) {
          console.log("Silent background update check:", err);
        }
      };

      const refreshPrayerAlarmsSilently = async () => {
        try {
          await Promise.resolve();
        } catch (e) {
          console.warn("Silent prayer refresh failed:", e);
        }
      };

      // Check after the first screen is ready; manual checks remain available in Settings.
      const timer = setTimeout(() => {
        void checkAndPresentUpdate(false);
        void refreshPrayerAlarmsSilently();
      }, 1200);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [showSplash]);

  return (
    <AppProvider>
      {showSplash ? (
        <SplashScreen onFinish={() => setShowSplash(false)} />
      ) : (
        <BiometricGuard>
          <div className="animate-in fade-in duration-700 min-h-screen">
            <AppContent />
          </div>
        </BiometricGuard>
      )}
    </AppProvider>
  );
}

export default App;
