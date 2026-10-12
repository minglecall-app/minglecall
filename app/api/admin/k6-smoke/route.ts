import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/nextAuth';
import { listK6SmokeScenarios, runK6Smoke } from '../../../../lib/k6Smoke';

export const runtime = 'nodejs';
export const maxDuration = 20;

function isAdmin(role: string, email?: string): boolean {
  return role === 'admin' || email === 'admin@livecall.app' || email === 'superadmin@minglecall.com';
}

function requestHostParts(req: NextRequest) {
  const host =
    req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  return { host, proto };
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.ok === false) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }
  if (!isAdmin(auth.role, auth.email)) {
    return NextResponse.json(
      { success: false, error: { message: 'Admin role required.', code: 'FORBIDDEN' } },
      { status: 403 }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const scenarioId = String(body?.scenarioId || '').trim();
  const { host, proto } = requestHostParts(req);
  const authorization = req.headers.get('authorization') || '';

  try {
    const result = await runK6Smoke(scenarioId, {
      authorization,
      concurrency: body?.concurrency,
      baseUrl: body?.baseUrl,
      host,
      proto,
    });
    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Unknown k6 smoke scenario. Known: ${listK6SmokeScenarios().join(', ')}`,
            code: 'UNKNOWN_SCENARIO',
          },
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[k6-smoke]', scenarioId, err?.message || err);
    return NextResponse.json(
      { success: false, error: { message: 'k6 smoke failed', code: 'K6_SMOKE_FAILED' } },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
