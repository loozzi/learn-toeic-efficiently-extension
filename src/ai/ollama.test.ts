import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { createOllamaProvider } from "./ollama";
import type { ProviderConfig } from "../shared/types";
const config: ProviderConfig = {
  provider: "ollama",
  apiKey: "",
  model: "llama3",
  supportsVision: false,
};
let lastAuth: string | null;
const server = setupServer(
  http.post("http://localhost:11434/v1/chat/completions", async ({ request }) => {
    lastAuth = request.headers.get("authorization");
    return HttpResponse.json({ choices: [{ message: { content: "ok" } }] });
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
describe("ollama adapter", () => {
  it("defaults to the local Ollama endpoint and a placeholder key", async () => {
    const result = await createOllamaProvider(config).complete(
      { system: "s", userParts: [{ type: "text", text: "hi" }], json: false },
      new AbortController().signal,
    );
    expect(result.text).toBe("ok");
    expect(lastAuth).toBe("Bearer ollama");
  });
  it("honours a custom baseUrl and a supplied key", async () => {
    let hit = false;
    server.use(
      http.post("https://ollama.example/v1/chat/completions", async ({ request }) => {
        hit = true;
        lastAuth = request.headers.get("authorization");
        return HttpResponse.json({ choices: [{ message: { content: "ok" } }] });
      }),
    );
    await createOllamaProvider({
      ...config,
      apiKey: "custom",
      baseUrl: "https://ollama.example/v1",
    }).complete(
      { system: "s", userParts: [], json: false },
      new AbortController().signal,
    );
    expect(hit).toBe(true);
    expect(lastAuth).toBe("Bearer custom");
  });
});
