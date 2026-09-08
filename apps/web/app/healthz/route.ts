import { NextResponse } from 'next/server';

/** Railway / load-balancer liveness — must return 200 (not a page redirect). */
export function GET() {
  return NextResponse.json({ ok: true, service: 'web' });
}
