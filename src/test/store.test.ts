import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeDailyUsage } from "@/lib/store";
import { generateId } from "@/lib/mock-data";
import type { UsageRecord } from "@/types";
import { subDays, format } from "date-fns";

describe("Store utility functions", () => {
  describe("generateId", () => {
    it("should generate unique IDs with default prefix", () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).toMatch(/^id-/);
      expect(id2).toMatch(/^id-/);
      expect(id1).not.toBe(id2);
    });

    it("should generate unique IDs with custom prefix", () => {
      const id1 = generateId("prov");
      const id2 = generateId("prov");
      expect(id1).toMatch(/^prov-/);
      expect(id2).toMatch(/^prov-/);
      expect(id1).not.toBe(id2);
    });
  });

  describe("computeDailyUsage", () => {
    const createRecord = (daysAgo: number, tokens: number, cost: number, providerId: string): UsageRecord => ({
      id: `rec-${daysAgo}`,
      providerId,
      providerName: "Test",
      model: "test-model",
      promptTokens: tokens,
      completionTokens: 0,
      totalTokens: tokens,
      cost,
      timestamp: subDays(new Date(), daysAgo).toISOString(),
      status: "success",
      latency: 100,
    });

    it("should compute daily usage for 30 days", () => {
      const records: UsageRecord[] = [
        createRecord(0, 1000, 0.01, "openai-1"),
        createRecord(0, 2000, 0.02, "anthropic-1"),
        createRecord(1, 3000, 0.03, "openai-1"),
      ];
      const daily = computeDailyUsage(records);
      expect(daily).toHaveLength(30);
    });

    it("should aggregate tokens and cost per day", () => {
      const records: UsageRecord[] = [
        createRecord(0, 1000, 0.01, "openai-1"),
        createRecord(0, 2000, 0.02, "anthropic-1"),
      ];
      const daily = computeDailyUsage(records);
      const today = format(new Date(), "yyyy-MM-dd");
      const todayRecord = daily.find((d) => d.date === today);
      expect(todayRecord).toBeDefined();
      expect(todayRecord?.totalTokens).toBe(3000);
      expect(todayRecord?.totalCost).toBe(0.03);
      expect(todayRecord?.requestCount).toBe(2);
    });

    it("should group by provider", () => {
      const records: UsageRecord[] = [
        createRecord(0, 1000, 0.01, "openai-1"),
        createRecord(0, 2000, 0.02, "anthropic-1"),
      ];
      const daily = computeDailyUsage(records);
      const today = format(new Date(), "yyyy-MM-dd");
      const todayRecord = daily.find((d) => d.date === today);
      expect(todayRecord?.byProvider["openai-1"]).toBeDefined();
      expect(todayRecord?.byProvider["openai-1"].tokens).toBe(1000);
      expect(todayRecord?.byProvider["anthropic-1"].tokens).toBe(2000);
    });

    it("should handle empty records", () => {
      const daily = computeDailyUsage([]);
      expect(daily).toHaveLength(30);
      const today = format(new Date(), "yyyy-MM-dd");
      const todayRecord = daily.find((d) => d.date === today);
      expect(todayRecord?.totalTokens).toBe(0);
      expect(todayRecord?.totalCost).toBe(0);
      expect(todayRecord?.requestCount).toBe(0);
    });
  });
});
