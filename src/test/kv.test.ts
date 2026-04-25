import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { kv } from "@/lib/kv";
import { get, set, del } from "idb-keyval";

// Mock idb-keyval
vi.mock("idb-keyval", () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

describe("KV Store (idb-keyval wrapper)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should get value with prefix", async () => {
    vi.mocked(get).mockResolvedValue("test-value");
    const result = await kv.get<string>("test");
    expect(get).toHaveBeenCalledWith("llm-gw:test");
    expect(result).toBe("test-value");
  });

  it("should set value with prefix", async () => {
    await kv.set("test", "value");
    expect(set).toHaveBeenCalledWith("llm-gw:test", "value");
  });

  it("should delete value with prefix", async () => {
    await kv.del("test");
    expect(del).toHaveBeenCalledWith("llm-gw:test");
  });

  it("should handle undefined get", async () => {
    vi.mocked(get).mockResolvedValue(undefined);
    const result = await kv.get<string>("nonexistent");
    expect(result).toBeUndefined();
  });
});
