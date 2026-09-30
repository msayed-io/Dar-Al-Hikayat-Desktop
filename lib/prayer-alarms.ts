/** Native Tauri/Web prayer notifications and location helpers. */
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { PrayerLocation, CalculationMethodId } from "./prayer-config";
import type { CityData } from "./prayer-cities";
import { PRAYER_DEFINITIONS } from "./prayer-config";
import { getTodayAndTomorrow } from "./prayer-times";
import { autoDetectLocation as detectLocation, getLastSavedLocation, clearAllLocationCache, saveSavedLocation, guessTimezone } from "./gps-location";

const PRAYER_SETTINGS_KEY = "dar_prayer_settings";
const ALARMS_STORAGE_KEY = "dar_prayer_alarms";
const PRAYER_IDS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
let scheduledTimers = new Map<string, ReturnType<typeof setTimeout>>();
let scheduleGeneration = 0;

export interface StoredPrayerSettings { method: CalculationMethodId; isInitialized: boolean; lastScheduleDate?: string; }
export const autoDetectLocation = detectLocation;
export const LOCATION_ACTIONABLE_ERROR_MESSAGE = "تعذر تحديد موقعك الآن. استخدم الموقع المحفوظ أو اختر موقعاً يدوياً، ويمكنك فتح إعدادات الموقع للمحاولة مرة أخرى.";
export { getLastSavedLocation, clearAllLocationCache, saveSavedLocation, guessTimezone };

function isTauriDesktop(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "tauri.localhost" || window.location.protocol === "tauri:";
}

function loadAlarmPreferences(): Record<string, boolean> {
  try {
    const parsed = JSON.parse(localStorage.getItem(ALARMS_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (isTauriDesktop()) {
    try {
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === "granted";
      return granted;
    } catch (error) {
      console.warn("Native notification permission check failed.", error);
      return false;
    }
  }
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  return (await Notification.requestPermission()) === "granted";
}

async function emitPrayerNotification(prayerId: string, location: PrayerLocation): Promise<void> {
  const definition = PRAYER_DEFINITIONS[prayerId as keyof typeof PRAYER_DEFINITIONS];
  const title = `حان الآن وقت صلاة ${definition?.nameAr || prayerId}`;
  const body = `في ${location.cityNameAr || location.cityName}. تقبّل الله طاعتكم.`;
  if (isTauriDesktop()) {
    await Promise.resolve(sendNotification({ title, body }));
    return;
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

function clearScheduledTimers(): void {
  for (const timer of scheduledTimers.values()) clearTimeout(timer);
  scheduledTimers.clear();
}

export function loadPrayerSettings(): StoredPrayerSettings {
  try { const raw = localStorage.getItem(PRAYER_SETTINGS_KEY); if (raw) return JSON.parse(raw); } catch {}
  return { method: "egyptian", isInitialized: false, lastScheduleDate: "" };
}
export function savePrayerSettings(s: StoredPrayerSettings): void { try { localStorage.setItem(PRAYER_SETTINGS_KEY, JSON.stringify(s)); } catch {} }

/** Schedules the next two days while the installed desktop process is running. */
export async function schedulePrayerAlarms(location: PrayerLocation, method: CalculationMethodId): Promise<boolean> {
  const generation = ++scheduleGeneration;
  clearScheduledTimers();
  const permissionGranted = await ensureNotificationPermission();
  if (!permissionGranted) return false;

  const preferences = loadAlarmPreferences();
  const { today, tomorrow } = getTodayAndTomorrow(location.latitude, location.longitude, method, location.timezoneId);
  const now = Date.now();
  const upcoming = [...today.prayers, ...tomorrow.prayers]
    .filter((prayer) => PRAYER_IDS.includes(prayer.prayerId as (typeof PRAYER_IDS)[number]))
    .filter((prayer) => preferences[prayer.prayerId] !== false && prayer.time.getTime() > now)
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  for (const prayer of upcoming) {
    const delay = prayer.time.getTime() - now;
    const key = `${prayer.prayerId}:${prayer.time.toISOString()}`;
    scheduledTimers.set(key, setTimeout(async () => {
      if (generation !== scheduleGeneration) return;
      try { await emitPrayerNotification(prayer.prayerId, location); }
      catch (error) { console.warn("Prayer notification delivery failed.", error); }
      await schedulePrayerAlarms(location, method);
    }, Math.min(delay, 2_147_000_000)));
  }

  if (upcoming.length === 0) {
    scheduledTimers.set("refresh", setTimeout(() => void schedulePrayerAlarms(location, method), 60_000));
  }
  return true;
}

export async function checkNotificationPermission(): Promise<boolean> {
  if (isTauriDesktop()) {
    try { return await isPermissionGranted(); } catch { return false; }
  }
  return typeof Notification === "undefined" || Notification.permission === "granted";
}
export async function requestNotificationPermission(): Promise<boolean> { return ensureNotificationPermission(); }
export async function requestExactAlarmPermission(): Promise<boolean> { return true; }
export async function checkExactAlarmPermission(): Promise<boolean> { return true; }
export async function openNativeNotificationSettings(): Promise<void> {}
export async function openNativeAppSettings(): Promise<void> {}
export async function checkBatteryOptimizationExemption(): Promise<boolean> { return true; }
export async function requestBatteryOptimizationExemption(): Promise<void> {}

export interface TestNotificationResult { success: boolean; message: string; }
export async function testPrayerNotification(): Promise<TestNotificationResult> {
  const granted = await ensureNotificationPermission();
  if (!granted) return { success: false, message: "إذن إشعارات Windows غير مفعّل." };
  try {
    const location: PrayerLocation = { latitude: 30.0444, longitude: 31.2357, cityName: "القاهرة", timezoneId: "Africa/Cairo", isAutoDetected: false };
    await emitPrayerNotification("dhuhr", location);
    return { success: true, message: "تم إرسال إشعار التجربة بنجاح!" };
  } catch {
    return { success: false, message: "تعذر إرسال إشعار التجربة من Windows." };
  }
}
export function cityToLocation(city: CityData): PrayerLocation { return { latitude: city.latitude, longitude: city.longitude, cityName: city.nameAr, timezoneId: city.timezoneId, isAutoDetected: false }; }
