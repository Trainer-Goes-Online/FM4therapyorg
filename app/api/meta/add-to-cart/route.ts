import { NextRequest, NextResponse } from 'next/server';
import { pricing } from '@/lib/config';
import { sendAddToCartEvent } from '@/lib/meta-events';

// ─────────────────────────────────────────────────────────────────────
// POST /api/meta/add-to-cart
//
// Triggered by a fire-and-forget navigator.sendBeacon from any landing-
// page CTA click (see components/CheckoutLink.tsx). The beacon carries
// only `eventSourceUrl` in the body; every matching signal (fbc/fbp/IP/
// UA) is read server-side from the same-origin request cookies + headers.
//
// Gates in order:
//   1. Test-mode gate — PRICE_INR=1 short-circuits, no side effects
//   2. Env-var check  — no META_PIXEL_ID/token → silent skip
//   3. Fire CAPI AddToCart → single event, EMQ ~3–5 by design
// ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const eventSourceUrl: string =
      typeof body?.eventSourceUrl === 'string' && body.eventSourceUrl.length > 0
        ? body.eventSourceUrl
        : 'https://www.fm4therapyindia.org/';

    if (!pricing.trackingEnabled) {
      console.log('[atc] tracking disabled (PRICE_INR=1) — skipping');
      return NextResponse.json({ ok: true, skipped: 'test_mode' });
    }

    const metaPixelId = process.env.META_PIXEL_ID;
    const metaAccessToken = process.env.META_CAPI_ACCESS_TOKEN;
    if (!metaPixelId || !metaAccessToken) {
      console.warn('[atc] META_PIXEL_ID or META_CAPI_ACCESS_TOKEN not set — skipping');
      return NextResponse.json({ ok: true, skipped: 'env_missing' });
    }

    const fbc = req.cookies.get('_fbc')?.value;
    const fbp = req.cookies.get('_fbp')?.value;
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      undefined;
    const clientUserAgent = req.headers.get('user-agent') ?? undefined;

    try {
      await sendAddToCartEvent({
        pixelId:         metaPixelId,
        accessToken:     metaAccessToken,
        fbc, fbp, clientIp, clientUserAgent,
        eventSourceUrl,
        value:           pricing.inr,
        currency:        pricing.currency,
      });
      console.log('[atc] CAPI sent');
      return NextResponse.json({ ok: true, capi: 'sent' });
    } catch (err) {
      console.error('[atc] CAPI error:', err);
      return NextResponse.json({ ok: true, capi: 'error' });
    }
  } catch (error) {
    console.error('[atc]', error);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
