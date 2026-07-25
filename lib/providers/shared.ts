import "server-only";

import type { ProviderErrorCode } from "./contract";
import type { LocalizedText, ProviderId, ProviderTrace } from "../types";

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user";
  content: string | ChatContentPart[];
}

interface CompatibleResponse {
  id?: unknown;
  model?: unknown;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
  choices?: Array<{ message?: { content?: unknown } }>;
}

export class ProviderCallError extends Error {
  constructor(readonly code: ProviderErrorCode) {
    super(code);
    this.name = "ProviderCallError";
  }
}

export function closedError(error: unknown): ProviderErrorCode {
  if (error instanceof ProviderCallError) return error.code;
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ZodError"
  ) return "schema_invalid";
  return "transport_failed";
}

export function providerTrace(
  provider: ProviderId,
  mode: ProviderTrace["mode"],
  task: LocalizedText,
  startedAt: string,
  latencyMs: number,
  ok: boolean,
  extra: Partial<ProviderTrace> = {}
): ProviderTrace {
  return { provider, mode, task, startedAt, latencyMs, ok, ...extra };
}

function safeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : undefined;
}

function httpError(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "auth_failed";
  if (status === 402) return "quota_exceeded";
  if (status === 404) return "model_not_found";
  if (status === 429) return "rate_limited";
  return "provider_http_error";
}

export async function openAICompatibleChat(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  enableThinking?: boolean;
  extraHeaders?: { "X-DashScope-WorkSpace"?: string };
  responseFormat?: { type: "json_object" };
  timeoutMs?: number;
}): Promise<{
  content: string;
  requestId?: string;
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}> {
  if (!Number.isInteger(input.maxTokens) || input.maxTokens < 1) {
    throw new ProviderCallError("config_missing");
  }
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(Math.max(input.timeoutMs ?? 25_000, 1_000), 30_000)
  );
  try {
    let response: Response;
    try {
      response = await fetch(
        `${input.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
            "Content-Type": "application/json",
            ...(input.extraHeaders?.["X-DashScope-WorkSpace"]
              ? {
                  "X-DashScope-WorkSpace":
                    input.extraHeaders["X-DashScope-WorkSpace"]
                }
              : {})
          },
          body: JSON.stringify({
            model: input.model,
            messages: input.messages,
            max_tokens: input.maxTokens,
            ...(input.enableThinking === undefined
              ? {}
              : { enable_thinking: input.enableThinking }),
            temperature: 0,
            response_format: input.responseFormat
          }),
          signal: controller.signal,
          cache: "no-store"
        }
      );
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        throw new ProviderCallError("timeout");
      }
      throw new ProviderCallError("transport_failed");
    }
    if (!response.ok) throw new ProviderCallError(httpError(response.status));

    let payload: CompatibleResponse;
    try {
      payload = (await response.json()) as CompatibleResponse;
    } catch {
      throw new ProviderCallError("schema_invalid");
    }
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new ProviderCallError(
        content === "" ? "response_empty" : "schema_invalid"
      );
    }
    const usage = payload.usage
      ? {
          promptTokens: safeInteger(payload.usage.prompt_tokens),
          completionTokens: safeInteger(payload.usage.completion_tokens),
          totalTokens: safeInteger(payload.usage.total_tokens)
        }
      : undefined;
    return {
      content,
      requestId: typeof payload.id === "string" ? payload.id : undefined,
      model: typeof payload.model === "string" ? payload.model : undefined,
      usage
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function safeJson<T>(text: string): T {
  try {
    const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
    return JSON.parse(trimmed) as T;
  } catch {
    throw new ProviderCallError("schema_invalid");
  }
}

export function configuredMaxCost(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function reserveFailureCode(
  code: import("../guard/types").ReserveFailureCode
): ProviderErrorCode {
  return code === "cap_unknown" ||
    code === "price_unknown" ||
    code === "estimate_unknown" ||
    code === "hard_limit_unknown"
    ? "budget_unknown"
    : "budget_blocked";
}
