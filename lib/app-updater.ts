import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";

export interface UpdateInfo {
  versionCode: number;
  versionName: string;
  downloadUrl: string;
  directDownloadUrl?: string;
  sha256?: string;
  fileSizeBytes?: number;
  mandatory?: boolean;
  releaseNotes?: string[];
  publishedAt?: string;
  assetName?: string;
  platform?: "windows";
}
export interface AppVersion { versionCode: number; versionName: string; packageName?: string; }
export interface DownloadProgress { progress: number; bytesDownloaded: number; totalBytes: number; }
export type UpdateCheckResult =
  | { hasUpdate: true; currentVersion: AppVersion; latestInfo: UpdateInfo; isMandatory: boolean }
  | { hasUpdate: false; currentVersion: AppVersion; latestInfo?: UpdateInfo; reason?: "up_to_date" | "throttled" | "ignored"; message?: string }
  | { hasUpdate: false; error: true; currentVersion?: AppVersion; message: string };

type GitHubReleaseAsset = { name?: string; size?: number; browser_download_url?: string; digest?: string | null; };
const DESKTOP_REPOSITORY = "msayed-io/Dar-Al-Hikayat-Desktop";
const GITHUB_LATEST_RELEASE_API_URL = `https://api.github.com/repos/${DESKTOP_REPOSITORY}/releases/latest`;
const UPDATE_CHECK_TIMEOUT_MS = 12_000;
const DESKTOP_PACKAGE_NAME = "com.daralhikayat.desktop";
const STORAGE_KEYS = {
  LAST_CHECK_TIME: "dar_desktop_last_update_check_time",
  IGNORED_VERSION: "dar_desktop_ignored_update_version",
  AUTO_CHECK_ENABLED: "dar_desktop_auto_update_check_enabled",
  LAST_NOTIFIED_VERSION: "dar_desktop_last_notified_update_version",
};

function isTauriDesktopRuntime() { return typeof window !== "undefined" && window.location.hostname === "tauri.localhost"; }
function parseVersion(version: string): [number, number, number] | null {
  const match = version.trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}
function compareVersions(left: string, right: string) {
  const a = parseVersion(left); const b = parseVersion(right);
  if (!a || !b) return left.localeCompare(right, undefined, { numeric: true });
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
function versionCode(version: string) { const p = parseVersion(version); return p ? p[0] * 1_000_000 + p[1] * 1_000 + p[2] : 0; }
function releaseNotes(body?: string | null) { return body ? body.split("\n").map((line) => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean) : []; }
function getWindowsInstallerAsset(assets: GitHubReleaseAsset[]) {
  return assets.find((asset) => { const name = asset.name?.toLowerCase() || ""; return name.endsWith("-setup.exe") && name.includes("x64"); })
    || assets.find((asset) => asset.name?.toLowerCase().endsWith(".exe"));
}

export async function notifyUpdateAvailable(updateInfo: UpdateInfo): Promise<void> { localStorage.setItem(STORAGE_KEYS.LAST_NOTIFIED_VERSION, String(updateInfo.versionCode)); }
/** Gets the installed Desktop version from native Tauri package metadata. */
export async function getCurrentAppVersion(): Promise<AppVersion> {
  let versionName = "0.0.0";
  if (isTauriDesktopRuntime()) versionName = await getVersion();
  return { versionCode: versionCode(versionName), versionName, packageName: DESKTOP_PACKAGE_NAME };
}
/** Checks only the latest Windows EXE published by the Desktop repository. */
export async function checkForUpdates(options?: { manual?: boolean; force?: boolean }): Promise<UpdateCheckResult> {
  const isManual = !!options?.manual; const isForce = !!options?.force;
  if (!isManual && !isForce) {
    if (localStorage.getItem(STORAGE_KEYS.AUTO_CHECK_ENABLED) === "false") return { hasUpdate: false, currentVersion: await getCurrentAppVersion(), reason: "throttled", message: "الفحص التلقائي معطّل في الإعدادات" };
    const lastCheck = Number(localStorage.getItem(STORAGE_KEYS.LAST_CHECK_TIME) || 0);
    if (lastCheck > 0 && Date.now() - lastCheck < 12 * 60 * 60 * 1000) return { hasUpdate: false, currentVersion: await getCurrentAppVersion(), reason: "throttled", message: "تم الفحص مؤخرًا" };
  }
  const currentVersion = await getCurrentAppVersion();
  try {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${GITHUB_LATEST_RELEASE_API_URL}?_t=${Date.now()}`, { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, cache: "no-store", signal: controller.signal });
    } finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error(`تعذر الوصول إلى خادم التحديث (HTTP ${response.status})`);
    const release = await response.json() as { tag_name?: string; body?: string | null; published_at?: string | null; assets?: GitHubReleaseAsset[] };
    const versionName = (release.tag_name || "").replace(/^v/i, ""); const asset = getWindowsInstallerAsset(release.assets || []);
    const downloadUrl = asset?.browser_download_url || ""; const sha256 = asset?.digest?.replace(/^sha256:/i, "");
    if (!parseVersion(versionName) || !downloadUrl || !/^https:\/\//i.test(downloadUrl) || !/^[a-f0-9]{64}$/i.test(sha256 || "") || !Number.isInteger(asset?.size) || (asset?.size || 0) <= 0) throw new Error("بيانات مثبت Windows المنشورة غير مكتملة أو غير آمنة.");
    const updateData: UpdateInfo = { versionCode: versionCode(versionName), versionName, downloadUrl, directDownloadUrl: downloadUrl, sha256, fileSizeBytes: asset?.size, mandatory: false, releaseNotes: releaseNotes(release.body), publishedAt: release.published_at || undefined, assetName: asset?.name, platform: "windows" };
    localStorage.setItem(STORAGE_KEYS.LAST_CHECK_TIME, Date.now().toString());
    if (compareVersions(updateData.versionName, currentVersion.versionName) <= 0) return { hasUpdate: false, currentVersion, latestInfo: updateData, reason: "up_to_date", message: "أنت تستخدم أحدث إصدار من دار الحكايات" };
    const ignoredVersion = localStorage.getItem(STORAGE_KEYS.IGNORED_VERSION) || "";
    if (!isManual && !isForce && !updateData.mandatory && ignoredVersion === updateData.versionName) return { hasUpdate: false, currentVersion, latestInfo: updateData, reason: "ignored", message: "تم تجاهل هذا الإصدار سابقًا" };
    return { hasUpdate: true, currentVersion, latestInfo: updateData, isMandatory: !!updateData.mandatory };
  } catch (err: any) { return { hasUpdate: false, error: true, currentVersion, message: err?.message || "تعذر التحقق من وجود تحديث جديد" }; }
}
export function ignoreUpdateVersion(versionCodeOrName: number | string) { localStorage.setItem(STORAGE_KEYS.IGNORED_VERSION, String(versionCodeOrName)); }
/** Opens the official Windows EXE download using the system default browser. */
export async function downloadUpdate(updateInfo: UpdateInfo, onProgress?: (progress: DownloadProgress) => void): Promise<{ success: boolean; filePath?: string }> {
  const url = updateInfo.directDownloadUrl || updateInfo.downloadUrl; if (!url) throw new Error("رابط مثبت Windows غير متوفر.");
  onProgress?.({ progress: 100, bytesDownloaded: updateInfo.fileSizeBytes || 0, totalBytes: updateInfo.fileSizeBytes || 0 });
  if (isTauriDesktopRuntime()) await openUrl(url); else if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  return { success: true, filePath: url };
}
export async function installDownloadedUpdate(filePath: string): Promise<void> { if (isTauriDesktopRuntime()) await openUrl(filePath); else if (typeof window !== "undefined") window.open(filePath, "_blank", "noopener,noreferrer"); }

type UpdateDialogListener = (state: { isOpen: boolean; updateInfo: UpdateInfo | null; currentVersion: AppVersion | null; isMandatory?: boolean }) => void;
const listeners = new Set<UpdateDialogListener>();
export function openUpdateDialog(updateInfo: UpdateInfo, currentVersion: AppVersion, isMandatory = false) { listeners.forEach((fn) => fn({ isOpen: true, updateInfo, currentVersion, isMandatory })); }
export function closeUpdateDialog() { listeners.forEach((fn) => fn({ isOpen: false, updateInfo: null, currentVersion: null })); }
export function subscribeToUpdateDialog(listener: UpdateDialogListener) { listeners.add(listener); return () => { listeners.delete(listener); }; }
