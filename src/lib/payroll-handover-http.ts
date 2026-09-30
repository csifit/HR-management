import { z } from "zod";

const bodySchema = z
  .object({
    version: z.number().int().positive().max(2147483647),
    confirm: z.literal(true),
    allowHistorical: z.boolean(),
  })
  .strict();
const MAX_BODY_BYTES = 4096;

// A cookie-authenticated mutation must originate from this exact origin. Missing
// Origin is rejected too; there is no external API or CORS integration here.
export async function readHandoverRequest(request: Request) {
  if (
    request.headers.get("origin") !== new URL(request.url).origin ||
    ["cross-site", "same-site"].includes(
      request.headers.get("sec-fetch-site") ?? "",
    )
  )
    throw new Error("origin");
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() !== "application/json"
  )
    throw new Error("body");
  if (
    Number(request.headers.get("content-length")) > MAX_BODY_BYTES ||
    !request.body
  )
    throw new Error("body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("body");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bodySchema.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
}
