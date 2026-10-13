/**
 * Typed adapter over api/_lib/cjs/k6Smoke.js for Express and Next.
 */
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const smoke = nodeRequire('../api/_lib/cjs/k6Smoke.js') as {
  listK6SmokeScenarios: () => string[];
  runK6Smoke: (scenarioId: string, input?: K6SmokeInput) => Promise<K6SmokeResult | null>;
  DEFAULT_CONCURRENCY: number;
  MAX_CONCURRENCY: number;
};

export type K6SmokeStep = {
  id: string;
  label: string;
  ok: boolean;
  latencyMs: number;
  detail: string;
  data?: Record<string, unknown>;
};

export type K6SmokeResult = {
  scenarioId: string;
  ok: boolean;
  latencyMs: number;
  summary: string;
  finishedAt: string;
  steps: K6SmokeStep[];
  metrics?: {
    okCount: number;
    failCount: number;
    avgMs: number;
    maxMs: number;
  } | null;
};

export type K6SmokeInput = {
  authorization?: string;
  concurrency?: number;
  baseUrl?: string;
  host?: string;
  proto?: string;
};

export function listK6SmokeScenarios(): string[] {
  return smoke.listK6SmokeScenarios();
}

export function runK6Smoke(
  scenarioId: string,
  input?: K6SmokeInput
): Promise<K6SmokeResult | null> {
  return smoke.runK6Smoke(scenarioId, input);
}

export const K6_SMOKE_DEFAULT_CONCURRENCY = smoke.DEFAULT_CONCURRENCY;
export const K6_SMOKE_MAX_CONCURRENCY = smoke.MAX_CONCURRENCY;
