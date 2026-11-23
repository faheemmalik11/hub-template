import { OpenAiApiError } from "./errors";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

interface OpenAiResponsePayload {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  output_text?: string;
  error?: { message?: string };
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
  throw new OpenAiApiError("OpenAI response contained no extractable text output.", payload);
}

export async function callOpenAiJsonSchema(
  apiKey: string,
  model: string,
  instructions: string,
  userText: string,
  schemaName: string,
  schema: object,
  temperature?: number,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model,
        ...(temperature !== undefined ? { temperature } : {}),
        instructions,
        input: [{ role: "user", content: [{ type: "input_text", text: userText }] }],
        text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
      }),
    });
  } catch (e) {
    throw new OpenAiApiError(`OpenAI request failed: ${errorMessage(e)}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new OpenAiApiError(`OpenAI API returned ${response.status}: ${body.slice(0, 500)}`, {
      status: response.status,
    });
  }

  const payload = (await response.json()) as OpenAiResponsePayload;
  const text = extractResponseText(payload);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new OpenAiApiError(`OpenAI response was not valid JSON: ${errorMessage(e)}`, {
      text: text.slice(0, 500),
    });
  }
}
