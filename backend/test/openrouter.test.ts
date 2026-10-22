import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aiPrompt,
  freeTextModel,
  zeroPrice,
} from "../src/openrouter.validation";
const free = {
  id: "example/text:free",
  name: "Free text",
  pricing: { prompt: "0", completion: "0.000", request: "0e-9" },
  architecture: { input_modalities: ["text"], output_modalities: ["text"] },
};
test("OpenRouter policy admits only zero-priced free text variants and never rounds tiny paid prices to zero", () => {
  assert.deepEqual(freeTextModel(free), { id: free.id, name: free.name });
  assert.ok(freeTextModel({ ...free, id: "openrouter/free" }));
  for (const model of [
    { ...free, id: "example/paid" },
    { ...free, pricing: { prompt: "1e-9999", completion: "0" } },
    { ...free, pricing: { prompt: "0", completion: "0", web_search: "0.001" } },
    { ...free, pricing: { prompt: "0", completion: "0", unknown_fee: null } },
    { ...free, pricing: { prompt: "0" } },
    {
      ...free,
      architecture: {
        input_modalities: ["image"],
        output_modalities: ["text"],
      },
    },
    {
      ...free,
      architecture: {
        input_modalities: ["text"],
        output_modalities: ["image"],
      },
    },
  ])
    assert.equal(freeTextModel(model), undefined);
  for (const price of ["", "-1", "NaN", "Infinity", "0.000001", 0, null])
    assert.equal(zeroPrice(price), false);
});
test("OpenRouter prompt validation rejects paid/remote IDs, credential/routing overrides and invalid input", () => {
  const input = {
    entityId: "22222222-2222-4222-8222-222222222222",
    modelId: free.id,
    prompt: " Explain renewals. ",
  };
  assert.equal(aiPrompt.parse(input).prompt, "Explain renewals.");
  for (const extra of [
    { entityId: "bad" },
    { modelId: "paid/model" },
    { modelId: "https://evil.example" },
    { prompt: " " },
    { prompt: "x".repeat(4001) },
    { prompt: "hello\0world" },
    { prompt: "\ud800" },
    { apiKey: "forbidden" },
    { provider: {} },
    { messages: [] },
    { role: "system" },
  ])
    assert.equal(aiPrompt.safeParse({ ...input, ...extra }).success, false);
});
