import { NextRequest, NextResponse } from 'next/server';
import { pricing } from '@/lib/config';
import { sendInitiateCheckoutEvent } from '@/lib/meta-events';
import type { CustomerData } from '@/lib/meta-capi';

// ─────────────────────────────────────────────────────────────────────
// POST /api/meta/initiate-checkout
//
// Triggered by the checkout form BEFORE it opens the Razorpay modal
// (see components/CheckoutForm.tsx). Body carries the customer object
// (form values) + eventSourceUrl. Cookies + IP + UA come from the same-
// origin request headers.
//
// Full 11-signal payload (em/ph/fn/ln/ct/country/external_id hashed
// + fbc/fbp/IP/UA raw) → EMQ 9+. external_id matches Purchase +
// browser MAM derivation exactly for cross-event identity.
// ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      customer,
      eventSourceUrl,
    }: {
      customer?: CustomerData;
      eventSourceUrl?: string;
    } = body;

    if (!customer?.email) {
      return NextResponse.json({ ok: false, error: 'missing_email' }, { status: 400 });
    }

    if (!pricing.trackingEnabled) {
      console.log('[ic] tracking disabled (PRICE_INR=1) — skipping');
      return NextResponse.json({ ok: true, skipped: 'test_mode' });
    }

    const metaPixelId = process.env.META_PIXEL_ID;
    const metaAccessToken = process.env.META_CAPI_ACCESS_TOKEN;
    if (!metaPixelId || !metaAccessToken) {
      console.warn('[ic] META_PIXEL_ID or META_CAPI_ACCESS_TOKEN not set — skipping');
      return NextResponse.json({ ok: true, skipped: 'env_missing' });
    }

    const fbc = req.cookies.get('_fbc')?.value;
    const fbp = req.cookies.get('_fbp')?.value;
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      undefined;
    const clientUserAgent = req.headers.get('user-agent') ?? undefined;

    const fullPhone = `${customer.dialCode ?? ''}${customer.phone ?? ''}`;
    const resolvedEventSourceUrl =
      eventSourceUrl && eventSourceUrl.length > 0
        ? eventSourceUrl
        : 'https://www.fm4therapyindia.org/product-checkout';

    try {
      await sendInitiateCheckoutEvent({
        pixelId:         metaPixelId,
        accessToken:     metaAccessToken,
        email:           customer.email,
        phone:           fullPhone,
        firstName:       customer.firstName ?? '',
        lastName:        customer.lastName ?? '',
        city:            customer.city ?? '',
        countryCode:     customer.countryCode ?? '',
        fbc, fbp, clientIp, clientUserAgent,
        eventSourceUrl:  resolvedEventSourceUrl,
        value:           pricing.inr,
        currency:        pricing.currency,
      });
      console.log('[ic] CAPI sent for', customer.email);
      return NextResponse.json({ ok: true, capi: 'sent' });
    } catch (err) {
      console.error('[ic] CAPI error:', err);
      return NextResponse.json({ ok: true, capi: 'error' });
    }
  } catch (error) {
    console.error('[ic]', error);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
