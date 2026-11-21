import { env } from "cloudflare:workers";

type GeminiResponse = {
  status?: string;
  steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  error?: { code?: number; status?: string };
};

export async function geminiJson<T>(instructions: string, input: unknown, schema: object, timeoutMs = 20_000): Promise<T> {
  const runtimeEnv = env as unknown as { GEMINI_API_KEY?: string; GEMINI_MODEL?: string };
  if (!runtimeEnv.GEMINI_API_KEY) throw new Error("api_key_not_configured");

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "x-goog-api-key": runtimeEnv.GEMINI_API_KEY,
      "Content-Type": "application/json",
      "Api-Revision": "2026-05-20",
    },
    body: JSON.stringify({
      model: runtimeEnv.GEMINI_MODEL || "gemini-3.5-flash-lite",
      input: `${instructions}\n\n입력 데이터:\n${typeof input === "string" ? input : JSON.stringify(input)}`,
      response_format: { type: "text", mime_type: "application/json", schema },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as GeminiResponse | null;
    console.error("Gemini request failed", { status: response.status, code: problem?.error?.code, type: problem?.error?.status });
    throw new Error("ai_service_unavailable");
  }

  const result = await response.json() as GeminiResponse;
  const output = result.steps?.filter(step => step.type === "model_output")
    .flatMap(step => step.content || []).filter(part => part.type === "text").map(part => part.text || "").join("");
  if (result.status !== "completed" || !output) throw new Error("ai_response_incomplete");
  return JSON.parse(output) as T;
}
