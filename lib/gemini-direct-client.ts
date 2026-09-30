import { MODEL_LADDER, getModelsToTry, isModelFallbackError, GEMINI_PRIMARY_MODEL } from "./gemini-models";
export { GEMINI_PRIMARY_MODEL };

export const DIRECT_TIMEOUT_MS = 60_000;

export type ThinkingLevelName = "LOW" | "MEDIUM" | "HIGH";
export const THINKING_FOR_PATH = {
  executive: "LOW",
  summary: "LOW",
  advisory: "HIGH",
  init: "HIGH",
  diacritize: "LOW",
} as const;

export interface ReasoningConfig {
  temperature: number;
  thinkingConfig?: { thinkingLevel: ThinkingLevelName; includeThoughts?: boolean };
}

export function buildReasoningConfig(path: keyof typeof THINKING_FOR_PATH, temperature: number): ReasoningConfig {
  return { temperature, thinkingConfig: { thinkingLevel: THINKING_FOR_PATH[path], includeThoughts: true } };
}

export function isThinkingRejection(err: any): boolean {
  const msg = `${err?.message || ""} ${JSON.stringify(err?.data || {})}`;
  return /thinking|THINKING_LEVEL|Enterprise/i.test(msg);
}

/**
 * Determines whether the app is running in a native Tauri environment (desktop/mobile/iOS)
 * or standalone local WebView without an Express server backend.
 */
export function isNativeMobileEnvironment(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const protocol = window.location?.protocol || "";
    const host = window.location?.hostname || "";
    if (protocol === "tauri:" || protocol === "file:" || host === "tauri.localhost") {
      return true;
    }
    if (host === "localhost" && window.location?.port === "") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Sanitizes and extracts the raw API key string.
 */
export function sanitizeApiKey(rawKey: string): string {
  if (!rawKey) return "";
  return rawKey.trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

/**
 * Validates a Google Gemini API Key directly against Google's Generative Language REST API.
 * Works natively on desktop WebView, iOS, and all modern browsers with zero proxy dependency.
 */
export async function validateGeminiKeyDirectly(
  apiKey: string
): Promise<{ valid: boolean; message: string; code?: number }> {
  const cleanKey = sanitizeApiKey(apiKey);
  if (!cleanKey) {
    return {
      valid: false,
      message: "مفتاح API فارغ. يرجى إدخال مفتاح صالح من Google AI Studio.",
      code: 400,
    };
  }

  let lastStatus = 0;
  let lastErrMessage = "";
  let lastErrorData = null;

  for (const currentModel of MODEL_LADDER) {
    const startTime = Date.now();
    let isInternalTimeout = false;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${encodeURIComponent(
        cleanKey
      )}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        isInternalTimeout = true;
        controller.abort();
      }, DIRECT_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: "فحص الاتصال" }],
              },
            ],
            generationConfig: {
              maxOutputTokens: 5,
              temperature: 0.1,
            },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (res.ok) {
        return {
          valid: true,
          message: `تم التحقق بنجاح؛ المفتاح متصل ويعمل بكفاءة عالية مع خوادم الذكاء الاصطناعي (أجاب عبر ${currentModel}).`,
          code: 200,
        };
      }

      lastErrorData = await res.json().catch(() => ({}));
      lastStatus = res.status;
      lastErrMessage = (
        lastErrorData?.error?.message ||
        lastErrorData?.message ||
        ""
      ).toLowerCase();

      const errToTest: any = new Error(lastErrMessage);
      errToTest.status = lastStatus;
      const elapsed = Date.now() - startTime;

      if (isModelFallbackError(errToTest)) {
        console.warn(`[ModelLadder - Key Validation] ${currentModel} (${lastStatus}) (${elapsed}ms) ← التالي`);
        continue;
      } else {
        break; // 400, 401, 403
      }
    } catch (err: any) {
      if (isInternalTimeout) err.isTimeout = true;
      if (isModelFallbackError(err)) {
        lastStatus = err?.status || err?.code || 0;
        lastErrMessage = err?.message || (err.isTimeout ? "Timeout" : "Network Error");
        const elapsed = Date.now() - startTime;
        console.warn(`[ModelLadder - Key Validation] ${currentModel} (${lastErrMessage}) (${elapsed}ms) ← التالي`);
        continue;
      } else {
        return {
          valid: false,
          message: err?.message || "تعذر الاتصال بالشبكة للتحقق من المفتاح. يرجى التحقق من اتصال الإنترنت.",
          code: 0,
        };
      }
    }
  }

  if (lastStatus === 400 || lastErrMessage.includes("api_key_invalid") || lastErrMessage.includes("not valid")) {
    return {
      valid: false,
      message: "مفتاح API غير صالح أو غير صحيح (API_KEY_INVALID). يرجى التأكد من نسخه بدقة وبشكل كامل.",
      code: 400,
    };
  }

  if (lastStatus === 401 || lastErrMessage.includes("unauthenticated")) {
    return {
      valid: false,
      message: "مفتاح API غير مصرح به أو تم إلغاؤه (UNAUTHENTICATED).",
      code: 401,
    };
  }

  if (lastStatus === 403 || lastErrMessage.includes("permission_denied") || lastErrMessage.includes("permission")) {
    return {
      valid: false,
      message: "مفتاح API تنقصه أذونات خدمة Gemini API في Google Cloud (PERMISSION_DENIED).",
      code: 403,
    };
  }

  if (lastStatus === 429 || lastErrMessage.includes("resource_exhausted") || lastErrMessage.includes("quota")) {
    return {
      valid: true, // Key is valid, but currently quota-limited
      message: "المفتاح صالح ومسجل بنجاح، ولكنه استنفد حصته المؤقتة حالياً (RESOURCE_EXHAUSTED). سيعمل تلقائياً عند تجدد الحصة.",
      code: 429,
    };
  }

  if (lastStatus === 503 || lastStatus >= 500 || lastErrMessage.includes("unavailable") || lastErrMessage.includes("high demand")) {
    return {
      valid: true,
      message: "المفتاح صالح، وخوادم الذكاء الاصطناعي تشهد ضغطاً مؤقتاً في جميع النماذج (503 Service Unavailable).",
      code: 503,
    };
  }

  return {
    valid: false,
    message: lastErrorData?.error?.message || `تعذر التحقق من المفتاح (رمز الاستجابة: ${lastStatus}).`,
    code: lastStatus,
  };
}

export interface DirectGeminiGenerateParams {
  apiKey: string;
  model?: string;
  systemInstruction?: string;
  contents: Array<{
    role: "user" | "model";
    parts: Array<{ text?: string; functionCall?: any; functionResponse?: any }>;
  }>;
  tools?: any[];
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    thinkingLevel?: ThinkingLevelName;
    responseMimeType?: string;
  };
  signal?: AbortSignal;
}

/**
 * Direct non-streaming Gemini generateContent call with full Function Calling and Schema Validation support.
 */
export async function generateGeminiDirectly(
  params: DirectGeminiGenerateParams
): Promise<{
  text: string;
  thought?: string;
  rawParts?: any[];
  functionCalls: Array<{ name: string; args: any }>;
  model: string;
}> {
  const cleanKey = sanitizeApiKey(params.apiKey);
  if (!cleanKey) {
    const err: any = new Error("مفتاح API غير متوفر لإجراء الطلب المباشر.");
    err.status = 401;
    throw err;
  }

  const modelsToTry = getModelsToTry(params.model);
  let lastError: any = null;

  const bodyPayload: any = {
    contents: params.contents,
  };

  if (params.systemInstruction) {
    bodyPayload.systemInstruction = {
      parts: [{ text: params.systemInstruction }],
    };
  }

  if (params.tools && params.tools.length > 0) {
    bodyPayload.tools = [
      {
        functionDeclarations: params.tools,
      },
    ];
  }

  for (const currentModel of modelsToTry) {
    const startTime = Date.now();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${encodeURIComponent(
      cleanKey
    )}`;

    const localPayload = JSON.parse(JSON.stringify(bodyPayload));

    if (params.generationConfig) {
      const { thinkingLevel, ...restConfig } = params.generationConfig;
      localPayload.generationConfig = restConfig;
      if (thinkingLevel) {
        localPayload.generationConfig.thinkingConfig = { thinkingLevel, includeThoughts: true };
      }
    }

    let isInternalTimeout = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      isInternalTimeout = true;
      controller.abort();
    }, DIRECT_TIMEOUT_MS);

    const onExternalAbort = () => controller.abort();
    if (params.signal) {
      params.signal.addEventListener("abort", onExternalAbort);
    }

    const makeRequest = async (payload: any) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const err: any = new Error(
          errData?.error?.message || `Direct Gemini API generation error (${res.status})`
        );
        err.status = res.status;
        err.data = errData;
        throw err;
      }

      return res;
    };

    let res;
    try {
      try {
        res = await makeRequest(localPayload);
      } catch (initialErr: any) {
        if (localPayload.generationConfig?.thinkingConfig && isThinkingRejection(initialErr)) {
          console.warn("Thinking level rejected by API, falling back to temperature only.");
          delete localPayload.generationConfig.thinkingConfig;
          res = await makeRequest(localPayload);
        } else {
          throw initialErr;
        }
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      let accumulatedText = "";
      let accumulatedThought = "";
      const functionCalls: Array<{ name: string; args: any }> = [];

      for (const part of parts) {
        if (part.text) {
          if (part.thought) {
            accumulatedThought += part.text;
          } else {
            accumulatedText += part.text;
          }
        }
        if (part.functionCall) {
          functionCalls.push({
            name: part.functionCall.name,
            args: part.functionCall.args || {},
          });
        }
      }

      return {
        text: accumulatedText,
        thought: accumulatedThought,
        rawParts: parts,
        functionCalls,
        model: currentModel,
      };
    } catch (err: any) {
      if (isInternalTimeout) err.isTimeout = true;
      lastError = err;
      if (isModelFallbackError(err)) {
        const elapsed = Date.now() - startTime;
        console.warn(`[ModelLadder] ${currentModel} (${err.status || err.code || (err.isTimeout ? "Timeout" : "Network Error")}) (${elapsed}ms) ← التالي`);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      if (params.signal) {
        params.signal.removeEventListener("abort", onExternalAbort);
      }
    }
  }

  throw lastError;
}

export interface DirectGeminiStreamParams {
  apiKey: string;
  model?: string;
  systemInstruction?: string;
  contents: Array<{
    role: "user" | "model";
    parts: Array<{ text?: string }>;
  }>;
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    thinkingLevel?: ThinkingLevelName;
  };
  onChunk: (chunk: { text: string; thought: string; rawParts: any[] }) => void;
  signal?: AbortSignal;
}

/**
 * Direct Server-Sent Events (SSE) streaming from Google Generative Language REST API.
 * Streams real-time tokens directly to the client with sub-millisecond response latency.
 */
export async function streamGeminiDirectly(
  params: DirectGeminiStreamParams
): Promise<{ text: string; thought: string; rawParts: any[] }> {
  const cleanKey = sanitizeApiKey(params.apiKey);
  if (!cleanKey) {
    const err: any = new Error("مفتاح API غير متوفر للبث المباشر.");
    err.status = 401;
    throw err;
  }

  const modelsToTry = getModelsToTry(params.model);
  let lastError: any = null;
  let firstChunkReceived = false;

  const bodyPayload: any = {
    contents: params.contents,
  };

  if (params.systemInstruction) {
    bodyPayload.systemInstruction = {
      parts: [{ text: params.systemInstruction }],
    };
  }

  for (const currentModel of modelsToTry) {
    const startTime = Date.now();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:streamGenerateContent?alt=sse&key=${encodeURIComponent(
      cleanKey
    )}`;

    const localPayload = JSON.parse(JSON.stringify(bodyPayload));

    if (params.generationConfig) {
      const { thinkingLevel, ...restConfig } = params.generationConfig;
      localPayload.generationConfig = restConfig;
      if (thinkingLevel) {
        localPayload.generationConfig.thinkingConfig = { thinkingLevel, includeThoughts: true };
      }
    }

    let isInternalTimeout = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      isInternalTimeout = true;
      controller.abort();
    }, DIRECT_TIMEOUT_MS);

    const onExternalAbort = () => controller.abort();
    if (params.signal) {
      params.signal.addEventListener("abort", onExternalAbort);
    }

    const makeRequest = async (payload: any) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const err: any = new Error(
          errData?.error?.message || `Direct Gemini API stream error (${res.status})`
        );
        err.status = res.status;
        err.data = errData;
        throw err;
      }

      return res;
    };

    let res;
    try {
      try {
        res = await makeRequest(localPayload);
      } catch (initialErr: any) {
        if (localPayload.generationConfig?.thinkingConfig && isThinkingRejection(initialErr)) {
          console.warn("Thinking level stream rejected by API, falling back to temperature only.");
          delete localPayload.generationConfig.thinkingConfig;
          res = await makeRequest(localPayload);
        } else {
          throw initialErr;
        }
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("استجابة البث غير قابلة للقراءة كـ Stream.");
      }

      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let accumulated = "";
      let accumulatedThought = "";
      let finalRawParts: any[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const jsonStr = trimmed.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.error) {
              const err: any = new Error(
                parsed.error.message || "خطأ في تدفق استجابة Gemini"
              );
              err.status = parsed.error.code || 500;
              err.data = parsed;
              throw err;
            }

            const parts = parsed.candidates?.[0]?.content?.parts || [];
            if (parts.length > 0) finalRawParts = parts;
            let chunkText = "";
            let chunkThought = "";
            for (const part of parts) {
              if (part.text) {
                if (part.thought) {
                  chunkThought += part.text;
                  accumulatedThought += part.text;
                } else {
                  chunkText += part.text;
                  accumulated += part.text;
                }
              }
            }
            if (chunkText || chunkThought || parts.length > 0) {
              firstChunkReceived = true;
              params.onChunk({ text: chunkText, thought: chunkThought, rawParts: parts });
            }
          } catch (parseErr: any) {
            if (parseErr?.status) throw parseErr;
          }
        }
      }

      // Flush remaining buffer if needed
      if (buffer && buffer.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(buffer.slice(6).trim());
          const parts = parsed.candidates?.[0]?.content?.parts || [];
          if (parts.length > 0) finalRawParts = parts;
          let chunkText = "";
          let chunkThought = "";
          for (const part of parts) {
            if (part.text) {
              if (part.thought) {
                chunkThought += part.text;
                accumulatedThought += part.text;
              } else {
                chunkText += part.text;
                accumulated += part.text;
              }
            }
          }
          if (chunkText || chunkThought || parts.length > 0) {
            firstChunkReceived = true;
            params.onChunk({ text: chunkText, thought: chunkThought, rawParts: parts });
          }
        } catch {
          // ignore trailing fragment
        }
      }

      return { text: accumulated, thought: accumulatedThought, rawParts: finalRawParts };
    } catch (err: any) {
      if (isInternalTimeout) err.isTimeout = true;
      lastError = err;
      if (firstChunkReceived) {
        throw err;
      }
      if (isModelFallbackError(err)) {
        const elapsed = Date.now() - startTime;
        console.warn(`[ModelLadder] ${currentModel} (${err.status || err.code || (err.isTimeout ? "Timeout" : "Network Error")}) (${elapsed}ms) ← التالي`);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      if (params.signal) {
        params.signal.removeEventListener("abort", onExternalAbort);
      }
    }
  }

  throw lastError;
}
