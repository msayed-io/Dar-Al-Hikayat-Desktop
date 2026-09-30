/** Web/Tauri prayer notifications and location helpers. */
import type { PrayerLocation, CalculationMethodId } from "./prayer-config";
import type { CityData } from "./prayer-cities";
import { autoDetectLocation as detectLocation, getLastSavedLocation, clearAllLocationCache, saveSavedLocation, guessTimezone } from "./gps-location";

const PRAYER_SETTINGS_KEY = "dar_prayer_settings";
export interface StoredPrayerSettings { method: CalculationMethodId; isInitialized: boolean; lastScheduleDate?: string; }
export const autoDetectLocation = detectLocation;
export const LOCATION_ACTIONABLE_ERROR_MESSAGE = "تعذر تحديد موقعك الآن. استخدم الموقع المحفوظ أو اختر موقعاً يدوياً، ويمكنك فتح إعدادات الموقع للمحاولة مرة أخرى.";
export { getLastSavedLocation, clearAllLocationCache, saveSavedLocation, guessTimezone };

export function loadPrayerSettings(): StoredPrayerSettings {
  try { const raw = localStorage.getItem(PRAYER_SETTINGS_KEY); if (raw) return JSON.parse(raw); } catch {}
  return { method: "egyptian", isInitialized: false, lastScheduleDate: "" };
}
export function savePrayerSettings(s: StoredPrayerSettings): void { try { localStorage.setItem(PRAYER_SETTINGS_KEY, JSON.stringify(s)); } catch {} }
export async function schedulePrayerAlarms(_location: PrayerLocation, _method: CalculationMethodId): Promise<boolean> {
  // Tauri desktop does not silently install OS alarm permissions. The UI remains functional and notifications are opt-in.
  return true;
}
export async function checkNotificationPermission(): Promise<boolean> { return typeof Notification === "undefined" || Notification.permission === "granted"; }
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return true;
  return (await Notification.requestPermission()) === "granted";
}
export async function requestExactAlarmPermission(): Promise<boolean> { return true; }
export async function checkExactAlarmPermission(): Promise<boolean> { return true; }
export async function openNativeNotificationSettings(): Promise<void> {}
export async function openNativeAppSettings(): Promise<void> {}
export async function checkBatteryOptimizationExemption(): Promise<boolean> { return true; }
export async function requestBatteryOptimizationExemption(): Promise<void> {}
export interface TestNotificationResult { success: boolean; message: string; }
export async function testPrayerNotification(): Promise<TestNotificationResult> {
  const title = "حان الآن وقت صلاة الظهر";
  const body = "إنَّ هَذَا وقتٌ تُفْتَحُ فِيهِ أَبْوَابُ السَّمَاءِ.";
  if (typeof Notification === "undefined") return { success: false, message: "الإشعارات غير متاحة في بيئة التشغيل الحالية." };
  const granted = await requestNotificationPermission();
  if (!granted) return { success: false, message: "إذن الإشعارات غير مفعّل." };
  new Notification(title, { body, icon: "/dar-al-hikayat-logo-royal_classic.png" });
  return { success: true, message: "تم إرسال إشعار التجربة بنجاح!" };
}
export function cityToLocation(city: CityData): PrayerLocation { return { latitude: city.latitude, longitude: city.longitude, cityName: city.nameAr, timezoneId: city.timezoneId, isAutoDetected: false }; }
