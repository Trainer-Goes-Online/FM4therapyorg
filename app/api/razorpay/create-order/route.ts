import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { pricing } from '@/lib/config';
import type { CustomerData, UtmData } from '@/lib/meta-capi';
import {
  ATTR_COOKIE,
  readAttrCookie,
  resolveAttribution,
  packJsonNote,
} from '@/lib/attribution';

// ─────────────────────────────────────────────────────────────────────
// Razorpay note limits (docs.razorpay.com/api/understand):
//   - max 15 keys per notes object
//   - each value ≤ 256 chars
// We now use 12 keys (was 9), leaving 3 in reserve. The added keys
// (clid, ts, rf, lu) support the L1–L6 attribution recovery pipeline.
// ─────────────────────────────────────────────────────────────────────
const NOTE_MAX_VALUE_LEN = 256;

const FUNNEL_KIND = 'client_funnel';

const CANONICAL_CHECKOUT_URL = 'https://www.fm4therapyindia.org/product-checkout';

function truncate(value: string | undefined | null, max = NOTE_MAX_VALUE_LEN): string {
  if (!value) return '';
  return value.length > max ? value.slice(0, max) : value;
}

let razorpay: Razorpay | null = null;

if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!razorpay) {
      console.error('[create-order] Razorpay not configured — missing env vars');
      return NextResponse.json(
        { error: 'Payment system not configured. Please contact support.' },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      amount = pricing.paise,
      currency = pricing.currency,
      customer,
      utm,
      fbclid,
    }: {
      amount?: number;
      currency?: string;
      customer?: CustomerData;
      utm?: UtmData;
      fbclid?: string;
    } = body;

    // ─── Server-side reads: cookies + headers ─────────────────────────
    const cookieFbc      = req.cookies.get('_fbc')?.value ?? '';
    const cookieFbp      = req.cookies.get('_fbp')?.value ?? '';
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      '';
    const clientUserAgent = req.headers.get('user-agent') ?? '';

    // ─── L2 — trust the edge cookie FIRST; body is a supplement ──────
    // The middleware.ts capture writes fm4_attr on landing. If the client
    // body carries additional / different UTMs (e.g. sessionStorage
    // supplement), resolveAttribution's precedence chain merges them:
    // cookie > body > referrer > _fbc.
    const cookieAttr = readAttrCookie(req.cookies.get(ATTR_COOKIE)?.value);
    const bodyAttr = {
      source:   utm?.source   ?? '',
      medium:   utm?.medium   ?? '',
      campaign: utm?.campaign ?? '',
      content:  utm?.content  ?? '',
      term:     utm?.term     ?? '',
      fbclid:   fbclid ?? '',
    };
    const resolved = resolveAttribution({
      cookieAttr,
      bodyAttr,
      referrer:   cookieAttr.referrer    ?? '',
      landingUrl: cookieAttr.landing_url ?? '',
      fbc:        cookieFbc,
    });

    // ─── L4 — synthesise _fbc from the resolved fbclid when the pixel
    // hasn't set it yet (tracking blockers, first-tap-before-pixel-loads).
    const fbc = cookieFbc
      || (resolved.fbclid ? `fb.1.${resolved.fbclidTs}.${resolved.fbclid}` : '');

    if (resolved.utmSource === 'none') {
      // Loud in Vercel logs so a real ad conversion with no attribution
      // trips the ops watch immediately, not weeks later at CRM review.
      console.error(
        '[create-order] ATTRIBUTION MISSING',
        `provenance=${resolved.provenance}`,
        `email=${customer?.email ?? '(missing)'}`,
      );
    }

    // ─── Build the 12-key notes payload (L5: packJsonNote replaces
    // truncate(JSON.stringify(...)) — see lib/attribution.ts for the
    // JSON-safe shrink-the-longest-value algorithm). ─────────────────
    const notes: Record<string, string> = {
      kind: FUNNEL_KIND,
      cust: packJsonNote({
        fn: customer?.firstName    ?? '',
        ln: customer?.lastName     ?? '',
        em: customer?.email        ?? '',
        ph: customer?.phone        ?? '',
        ct: customer?.city         ?? '',
        co: customer?.countryCode  ?? '',
        dl: customer?.dialCode     ?? '',
        tp: customer?.customerType ?? '',
      }, NOTE_MAX_VALUE_LEN),
      utm: packJsonNote({
        s: resolved.utm.source,
        m: resolved.utm.medium,
        c: resolved.utm.campaign,
        n: resolved.utm.content,
        t: resolved.utm.term,
      }, NOTE_MAX_VALUE_LEN),
      clid: truncate(resolved.fbclid),
      ts:   truncate(String(resolved.fbclidTs || '')),
      fbc:  truncate(fbc),
      fbp:  truncate(cookieFbp),
      ip:   truncate(clientIp),
      ua:   truncate(clientUserAgent),
      rf:   truncate(resolved.referrer),
      lu:   truncate(resolved.landingUrl),
      esu:  CANONICAL_CHECKOUT_URL,
    };

    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt: `receipt_${Date.now()}`,
      notes,
    });

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('[create-order]', error);
    return NextResponse.json(
      { error: 'Failed to create order. Please try again.' },
      { status: 500 }
    );
  }
}
