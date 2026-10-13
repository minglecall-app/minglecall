/**
 * Typed adapter over api/_lib/cjs/systemDiagnostics.js so Express and Next
 * share the Vercel router implementation.
 */
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const diagnostics = nodeRequire('../api/_lib/cjs/systemDiagnostics.js') as {
  listServerDiagnosticModules: () => string[];
  runServerDiagnostic: (moduleId: string, input: DiagnosticInput) => Promise<DiagnosticResult | null>;
  collectInfraStatus: (input: { profileId?: string }) => Promise<InfraStatusSnapshot>;
};

export type DiagnosticStep = {
  id: string;
  label: string;
  ok: boolean;
  latencyMs: number;
  detail: string;
  data?: Record<string, unknown>;
};

export type DiagnosticResult = {
  moduleId: string;
  ok: boolean;
  latencyMs: number;
  summary: string;
  finishedAt: string;
  steps: DiagnosticStep[];
};

export type DiagnosticInput = {
  profileId: string;
  channel?: string;
  nonce?: string;
  token?: string;
};

export type InfraSystemMode = 'live' | 'degraded' | 'unavailable';

export type InfraSystemStatus = {
  id: string;
  label: string;
  mode: InfraSystemMode;
  detail: string;
  latencyMs: number;
  checkedAt: string;
};

export type InfraStatusSnapshot = {
  checkedAt: string;
  latencyMs: number;
  overall: 'healthy' | 'degraded' | 'critical';
  systems: InfraSystemStatus[];
};

export function listServerDiagnosticModules(): string[] {
  return diagnostics.listServerDiagnosticModules();
}

export function runServerDiagnostic(
  moduleId: string,
  input: DiagnosticInput
): Promise<DiagnosticResult | null> {
  return diagnostics.runServerDiagnostic(moduleId, input);
}

export function collectInfraStatus(input: { profileId?: string }): Promise<InfraStatusSnapshot> {
  return diagnostics.collectInfraStatus(input || {});
}
