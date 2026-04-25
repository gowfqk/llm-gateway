import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestGet as onRequestGetModels } from "../../functions/v1/models.js";
import { onRequestPost as onRequestPostChat } from "../../functions/v1/chat/completions.js";

function makeGetContext({
  headers = {},
  env = {},
}: {
  headers?: Record<string, string>;
  env?: Record<string, string>;
} = {}) {
  return {
    request: new Request("https://gateway.example.com/v1/models", {
      method: "GET",
      headers,
    }),
    env,
  };
}

function makePostContext({
  headers = {},
  body = {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "hello" }],
  },
  env = {},
}: {
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  env?: Record<string, string>;
} = {}) {
  return {
    request: new Request("https://gateway.example.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
    env,
  };
}

describe("v1 endpoints gateway auth via Supabase", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should allow /v1/models with bearer key stored in Supabase gateway_configs", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("https://supabase.example/rest/v1/gateway_configs")) {
        return new Response(JSON.stringify([{ user_id: "user-1" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const response = await onRequestGetModels(
      makeGetContext({
        headers: { Authorization: "Bearer gw_live_sk_supabase" },
        env: {
          SUPABASE_URL: "https://supabase.example",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
          PROVIDERS_JSON: JSON.stringify([
            {
              id: "openai-1",
              name: "OpenAI",
              type: "openai",
              base_url: "https://api.openai.com/v1",
              api_key: "$OPENAI_API_KEY",
              enabled: true,
              models: ["gpt-4o-mini"],
            },
          ]),
          OPENAI_API_KEY: "sk-upstream",
        },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "gpt-4o-mini", owned_by: "OpenAI" }),
      ])
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("api_keys=cs.%7Bgw_live_sk_supabase%7D");
  });

  it("should allow /v1/chat/completions with bearer key stored in Supabase gateway_configs", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("https://supabase.example/rest/v1/gateway_configs")) {
        return new Response(JSON.stringify([{ user_id: "user-1" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("https://supabase.example/rest/v1/route_rules")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "https://api.openai.com/v1/chat/completions") {
        expect(init).toEqual(
          expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({ Authorization: "Bearer sk-upstream" }),
          })
        );
        return new Response(
          JSON.stringify({
            id: "chatcmpl-1",
            object: "chat.completion",
            created: 123,
            model: "gpt-4o-mini",
            choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const response = await onRequestPostChat(
      makePostContext({
        headers: { Authorization: "Bearer gw_live_sk_supabase" },
        env: {
          SUPABASE_URL: "https://supabase.example",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
          PROVIDERS_JSON: JSON.stringify([
            {
              id: "openai-1",
              name: "OpenAI",
              type: "openai",
              base_url: "https://api.openai.com/v1",
              api_key: "$OPENAI_API_KEY",
              enabled: true,
              models: ["gpt-4o-mini"],
            },
          ]),
          OPENAI_API_KEY: "sk-upstream",
        },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(
      expect.objectContaining({
        id: "chatcmpl-1",
        _gateway: expect.objectContaining({ provider: "OpenAI", providerId: "openai-1" }),
      })
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("api_keys=cs.%7Bgw_live_sk_supabase%7D");
  });
});
