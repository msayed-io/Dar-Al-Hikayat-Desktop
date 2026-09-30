const CREDENTIAL_STORAGE_KEY = "dar_windows_hello_credential_v1";
const RP_NAME = "دار الحكايات";

interface StoredCredential {
  id: string;
}

function toBase64Url(bytes: ArrayBuffer): string {
  const data = new Uint8Array(bytes);
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function getWebAuthn(): typeof PublicKeyCredential | null {
  if (typeof window === "undefined" || !window.isSecureContext) return null;
  if (!("credentials" in navigator) || typeof PublicKeyCredential === "undefined") return null;
  return PublicKeyCredential;
}

function getStoredCredential(): StoredCredential | null {
  try {
    const raw = localStorage.getItem(CREDENTIAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCredential;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

export function hasWindowsHelloCredential(): boolean {
  return Boolean(getStoredCredential());
}

export async function isWindowsHelloAvailable(): Promise<boolean> {
  const credentialApi = getWebAuthn();
  if (!credentialApi) return false;
  try {
    return await credentialApi.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function registerWindowsHelloCredential(): Promise<boolean> {
  const credentialApi = getWebAuthn();
  if (!credentialApi) throw new Error("Windows Hello غير متاح في بيئة التشغيل الآمنة الحالية.");
  if (!(await isWindowsHelloAvailable())) {
    throw new Error("لم يتم العثور على مستشعر بصمة أو Windows Hello مفعّل على هذا الجهاز.");
  }

  const existing = getStoredCredential();
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: RP_NAME, id: window.location.hostname },
      user: {
        id: randomBytes(32),
        name: "dar-al-hikayat-user",
        displayName: "مستخدم دار الحكايات",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      excludeCredentials: existing
        ? [{ type: "public-key", id: fromBase64Url(existing.id) }]
        : [],
      timeout: 60_000,
      attestation: "none",
    },
  });

  if (!(credential instanceof PublicKeyCredential)) return false;
  localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify({ id: toBase64Url(credential.rawId) }));
  return true;
}

export async function authenticateWithWindowsHello(): Promise<boolean> {
  const credentialApi = getWebAuthn();
  const stored = getStoredCredential();
  if (!credentialApi || !stored) return false;

  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        rpId: window.location.hostname,
        allowCredentials: [{ type: "public-key", id: fromBase64Url(stored.id) }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return credential instanceof PublicKeyCredential;
  } catch (error) {
    // Cancellation, failed fingerprint, or an unavailable Hello provider must keep the app locked.
    console.warn("Windows Hello authentication was not completed.", error);
    return false;
  }
}
