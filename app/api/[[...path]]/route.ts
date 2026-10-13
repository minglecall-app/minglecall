import { NextRequest } from 'next/server';
import { dispatchExpress } from '../../../lib/expressAdapter';
import { getApp } from '../../../server';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

async function handle(req: NextRequest) {
  try {
    const app = await getApp();
    return await dispatchExpress(app, req);
  } catch (err: any) {
    console.error('[api] Next route failed:', err);
    return Response.json(
      {
        success: false,
        error: { message: 'API failed to start', code: 'FUNCTION_BOOT_FAILED' },
      },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
