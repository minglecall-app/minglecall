/**
 * Typed adapter over api/_lib/cjs/systemDiagnostics.js so Express and Next
 * share the Vercel router implementation.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const diagnostics = require('../api/_lib/cjs/systemDiagnostics.js') as {
  listServerDiagnosticModules: () => string[];
  runServerDiagnostic: (moduleId: string, input: DiagnosticInput) => Promise<DiagnosticResult | null>;
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

export function listServerDiagnosticModules(): string[] {
  return diagnostics.listServerDiagnosticModules();
}

export function runServerDiagnostic(
  moduleId: string,
  input: DiagnosticInput
): Promise<DiagnosticResult | null> {
  return diagnostics.runServerDiagnostic(moduleId, input);
}
