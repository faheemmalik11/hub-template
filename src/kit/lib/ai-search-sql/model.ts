import type { EmbeddingClient, ModelJsonClient, ModelJsonRequest, ModelUsage } from "./types";

export class AiSearchModelError extends Error {
  details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "AiSearchModelError";
    this.details = details;
  }
}

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const DEFAULT_TIMEOUT_MS = 30_000;

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

interface OpenAiResponsePayload {
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  output_text?: string;
  error?: { message?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
}

export function extractResponseText(payload: OpenAiResponsePayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.length > 0) {
    return payload.output_text;
  }
  for (const item of payload.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  throw new AiSearchModelError("Model response contained no extractable text output.", payload);
}

export interface OpenAiClientOptions {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  provider?: string;
}

export function openAiModelClient(options: OpenAiClientOptions): ModelJsonClient {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const provider = options.provider ?? "openai";
  return {
    async completeJson(
      request: ModelJsonRequest,
    ): Promise<{ data: unknown; usage: ModelUsage | null }> {
      let response: Response;
      try {
        response = await doFetch(OPENAI_RESPONSES_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            model: options.model,
            ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
            instructions: request.instructions,
            input: [{ role: "user", content: [{ type: "input_text", text: request.input }] }],
            text: {
              format: {
                type: "json_schema",
                name: request.schemaName,
                strict: true,
                schema: request.schema,
              },
            },
          }),
        });
      } catch (e) {
        throw new AiSearchModelError(`Model request failed: ${errorMessage(e)}`);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new AiSearchModelError(
          `Model API returned ${response.status}: ${body.slice(0, 500)}`,
          { status: response.status },
        );
      }

      const payload = (await response.json()) as OpenAiResponsePayload;
      const text = extractResponseText(payload);
      const usage: ModelUsage | null = payload.usage
        ? {
            provider,
            model: options.model,
            inputTokens: payload.usage.input_tokens ?? 0,
            outputTokens: payload.usage.output_tokens ?? 0,
          }
        : null;
      try {
        return { data: JSON.parse(text), usage };
      } catch (e) {
        throw new AiSearchModelError(`Model response was not valid JSON: ${errorMessage(e)}`, {
          text: text.slice(0, 500),
        });
      }
    },
  };
}

export interface OpenAiEmbeddingOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function openAiEmbeddingClient(options: OpenAiEmbeddingOptions): EmbeddingClient {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const model = options.model ?? "text-embedding-3-small";
  return {
    async embed(text: string): Promise<number[]> {
      let response: Response;
      try {
        response = await doFetch(OPENAI_EMBEDDINGS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({ model, input: text }),
        });
      } catch (e) {
        throw new AiSearchModelError(`Embeddings request failed: ${errorMessage(e)}`);
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new AiSearchModelError(
          `Embeddings API returned ${response.status}: ${body.slice(0, 500)}`,
        );
      }
      const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
      const embedding = payload.data?.[0]?.embedding;
      if (!embedding) {
        throw new AiSearchModelError("Embeddings response contained no vector.", payload);
      }
      return embedding;
    },
  };
}
