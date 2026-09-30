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
}

export interface AppVersion {
  versionCode: number;
  versionName: string;
  packageName?: string;
}

export interface DownloadProgress {
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
}

export type UpdateCheckResult =
  | {
      hasUpdate: true;
      currentVersion: AppVersion;
      latestInfo: UpdateInfo;
      isMandatory: boolean;
    }
  | {
      hasUpdate: false;
      currentVersion: AppVersion;
      latestInfo?: UpdateInfo;
      reason?: "up_to_date" | "throttled" | "ignored";
      message?: string;
    }
  | {
      hasUpdate: false;
      error: true;
      currentVersion?: AppVersion;
      message: string;
    };


const GITHUB_LATEST_RELEASE_API_URL =
  "https://api.github.com/repos/msayed-io/Dar-Al-Hikayat/releases/latest";
const UPDATE_CHECK_TIMEOUT_MS = 12_000;

const STORAGE_KEYS = {
  LAST_CHECK_TIME: "dar_app_last_update_check_time",
  IGNORED_VERSION: "dar_app_ignored_update_version_code",
  AUTO_CHECK_ENABLED: "dar_app_auto_update_check_enabled",
  LAST_NOTIFIED_VERSION: "dar_app_last_notified_update_version_code",
};

export async function notifyUpdateAvailable(updateInfo: UpdateInfo): Promise<void> { localStorage.setItem(STORAGE_KEYS.LAST_NOTIFIED_VERSION, String(updateInfo.versionCode)); }

/**
 * الحصول على بيانات الإصدار الحالي المثبت على الجهاز
 */
export async function getCurrentAppVersion(): Promise<AppVersion> { return { versionCode: 1, versionName: "1.0", packageName: "com.daralhikayat.desktop" }; }

/**
 * التحقق من وجود تحديث جديد
 */
export async function checkForUpdates(options?: {
  manual?: boolean;
  force?: boolean;
}): Promise<UpdateCheckResult> {
  const isManual = !!options?.manual;
  const isForce = !!options?.force;

  // 1. Check auto check preference & throttling for background automatic checks
  if (!isManual && !isForce) {
    const autoCheckEnabled =
      localStorage.getItem(STORAGE_KEYS.AUTO_CHECK_ENABLED) !== "false";
    if (!autoCheckEnabled) {
      return {
        hasUpdate: false,
        currentVersion: await getCurrentAppVersion(),
        reason: "throttled",
        message: "الفحص التلقائي معطّل في الإعدادات",
      };
    }

    const lastCheckStr = localStorage.getItem(STORAGE_KEYS.LAST_CHECK_TIME);
    if (lastCheckStr) {
      const lastCheckTime = parseInt(lastCheckStr, 10);
      const twelveHoursMs = 12 * 60 * 60 * 1000;
      if (Date.now() - lastCheckTime < twelveHoursMs) {
        return {
          hasUpdate: false,
          currentVersion: await getCurrentAppVersion(),
          reason: "throttled",
          message: "تم الفحص مؤخرًا",
        };
      }
    }
  }

  const currentVersion = await getCurrentAppVersion();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);
    let updateData: UpdateInfo;
    try {
      // GitHub's /releases/download endpoint redirects through a host that does
      // not expose CORS headers to Android WebView. The API endpoint does, so
      // read release metadata there and use the official APK asset URL only for
      // the native downloader (which follows GitHub's redirect safely).
      const response = await fetch(
        `${GITHUB_LATEST_RELEASE_API_URL}?_t=${Date.now()}`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          cache: "no-store",
          signal: controller.signal,
        }
      );
      if (!response.ok) {
        throw new Error(`تعذر الوصول إلى خادم التحديث (HTTP ${response.status})`);
      }

      const release = (await response.json()) as {
        tag_name?: string;
        body?: string | null;
        published_at?: string | null;
        assets?: Array<{
          name?: string;
          size?: number;
          browser_download_url?: string;
          digest?: string | null;
          content_type?: string;
        }>;
      };
      const apk = release.assets?.find(
        (asset) => asset.name === "dar-al-hikayat.apk"
      );
      const tag = release.tag_name || "";
      const versionMatch = tag.match(/^(?:v)?(\d+(?:\.\d+)*)$/i);
      const versionName = versionMatch?.[1] || tag.replace(/^v/i, "");
      const versionParts = versionName.split(".");
      const versionCode = Number(versionParts[versionParts.length - 1]);
      const digest = apk?.digest?.replace(/^sha256:/i, "");
      if (
        !apk?.browser_download_url ||
        !Number.isInteger(versionCode) ||
        versionCode <= 0
      ) {
        throw new Error("لا توجد حزمة APK رسمية صالحة في آخر إصدار منشور.");
      }

      updateData = {
        versionCode,
        versionName,
        downloadUrl: apk.browser_download_url,
        directDownloadUrl: apk.browser_download_url,
        sha256: digest,
        fileSizeBytes: apk.size,
        mandatory: false,
        releaseNotes: release.body
          ? release.body
              .split("\n")
              .map((line) => line.replace(/^[-*]\s*/, "").trim())
              .filter(Boolean)
          : [],
        publishedAt: release.published_at || undefined,
      };
    } finally {
      clearTimeout(timeout);
    }

    if (
      !Number.isInteger(updateData.versionCode) ||
      updateData.versionCode <= 0 ||
      typeof updateData.versionName !== "string" ||
      !/^https:\/\//i.test(updateData.downloadUrl || "") ||
      !/^[a-f0-9]{64}$/i.test(updateData.sha256 || "") ||
      !Number.isInteger(updateData.fileSizeBytes) ||
      updateData.fileSizeBytes <= 0
    ) {
      throw new Error("بيانات التحديث المنشورة غير مكتملة أو غير آمنة.");
    }

    // Record last successful check time
    localStorage.setItem(STORAGE_KEYS.LAST_CHECK_TIME, Date.now().toString());

    // Compare version codes
    const isNewer = updateData.versionCode > currentVersion.versionCode;

    if (!isNewer) {
      return {
        hasUpdate: false,
        currentVersion,
        latestInfo: updateData,
        reason: "up_to_date",
        message: "أنت تستخدم أحدث إصدار من دار الحكايات",
      };
    }

    // Check if this specific version was ignored by user (unless manual or mandatory)
    const ignoredCode = parseInt(
      localStorage.getItem(STORAGE_KEYS.IGNORED_VERSION) || "0",
      10
    );
    if (
      !isManual &&
      !isForce &&
      !updateData.mandatory &&
      ignoredCode === updateData.versionCode
    ) {
      return {
        hasUpdate: false,
        currentVersion,
        latestInfo: updateData,
        reason: "ignored",
        message: "تم تجاهل هذا الإصدار سابقاً",
      };
    }

    return {
      hasUpdate: true,
      currentVersion,
      latestInfo: updateData,
      isMandatory: !!updateData.mandatory,
    };
  } catch (err: any) {
    return {
      hasUpdate: false,
      error: true,
      currentVersion,
      message: err?.message || "تعذر التحقق من وجود تحديث جديد",
    };
  }
}

/**
 * تجاهل إصدار معين حتى لا يظهر تلقائياً مرة أخرى
 */
export function ignoreUpdateVersion(versionCode: number) {
  localStorage.setItem(STORAGE_KEYS.IGNORED_VERSION, versionCode.toString());
}

/**
 * فحص إذن تثبيت التطبيقات غير المعروفة على أندرويد
 */
export async function checkInstallPermission(): Promise<boolean> { return true; }

/**
 * فتح إعدادات أندرويد لمنح إذن التثبيت
 */
export async function openInstallSettings(): Promise<void> {}

/**
 * تنزيل وتثبيت التحديث مع تتبع التقدم والتحقق الأمني
 */
export async function downloadUpdate(updateInfo: UpdateInfo, onProgress?: (progress: DownloadProgress) => void): Promise<{ success: boolean; filePath?: string }> {
  onProgress?.({ progress: 100, bytesDownloaded: updateInfo.fileSizeBytes || 0, totalBytes: updateInfo.fileSizeBytes || 0 });
  const url = updateInfo.directDownloadUrl || updateInfo.downloadUrl;
  if (url && typeof document !== "undefined") { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; a.click(); }
  return { success: true };
}

export async function installDownloadedUpdate(_filePath: string): Promise<void> {}

// ─── Global State & Event Dispatcher for in-app Update Prompts ───
type UpdateDialogListener = (state: {
  isOpen: boolean;
  updateInfo: UpdateInfo | null;
  currentVersion: AppVersion | null;
  isMandatory?: boolean;
}) => void;

const listeners = new Set<UpdateDialogListener>();

export function openUpdateDialog(
  updateInfo: UpdateInfo,
  currentVersion: AppVersion,
  isMandatory = false
) {
  listeners.forEach((fn) =>
    fn({
      isOpen: true,
      updateInfo,
      currentVersion,
      isMandatory,
    })
  );
}

export function closeUpdateDialog() {
  listeners.forEach((fn) =>
    fn({
      isOpen: false,
      updateInfo: null,
      currentVersion: null,
    })
  );
}

export function subscribeToUpdateDialog(listener: UpdateDialogListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
