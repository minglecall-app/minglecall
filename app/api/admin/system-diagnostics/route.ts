import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/nextAuth';
import { listServerDiagnosticModules, runServerDiagnostic } from '../../../../lib/systemDiagnostics';

export const runtime = 'nodejs';
export const maxDuration = 20;

function isAdmin(role: string, email?: string): boolean {
  return role === 'admin' || email === 'admin@livecall.app' || email === 'superadmin@minglecall.com';
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

  const moduleId = String(body?.moduleId || '').trim();
  try {
    const result = await runServerDiagnostic(moduleId, {
      profileId: auth.profileId,
      channel: body?.channel,
      nonce: body?.nonce,
      token: body?.token,
    });
    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Unknown diagnostic module. Known: ${listServerDiagnosticModules().join(', ')}`,
            code: 'UNKNOWN_MODULE',
          },
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[system-diagnostics]', moduleId, err?.message || err);
    return NextResponse.json(
      { success: false, error: { message: 'Diagnostic failed', code: 'DIAGNOSTIC_FAILED' } },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
