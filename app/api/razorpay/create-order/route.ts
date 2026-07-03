import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { pricing } from '@/lib/config';
import type { CustomerData, UtmData } from '@/lib/meta-capi';

// ─────────────────────────────────────────────────────────────────────
// Razorpay note limits:
//   - max 15 keys per notes object
//   - each value ≤ 256 chars (docs.razorpay.com/api/understand)
// We use 9 keys, leaving 6 in reserve.
// ─────────────────────────────────────────────────────────────────────
const NOTE_MAX_VALUE_LEN = 256;

// Sentinel value on notes.kind that the webhook checks before doing any
// tracking. Merchant Razorpay accounts can receive payments from other
// funnels/apps; the webhook must fire Pabbly + CAPI ONLY for ours.
const FUNNEL_KIND = 'client_funnel';

// Canonical checkout URL used as the CAPI event_source_url. The client's
// live URL routinely exceeds 256 chars (utm_*+fbclid in the query string),
// so we strip the query and preserve the UTMs / fbclid in their own notes.
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

    // Server-side reads — the webhook (server-to-server) has no user
    // cookies/headers, so we snapshot them now into notes for later use.
    const fbc = req.cookies.get('_fbc')?.value ?? '';
    const fbp = req.cookies.get('_fbp')?.value ?? '';
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      '';
    const clientUserAgent = req.headers.get('user-agent') ?? '';

    // Build the 9-key notes payload. Every value is a string and every
    // value is truncated to 256 chars defensively (see NOTE_MAX_VALUE_LEN
    // + the truncate() helper) so we can't accidentally break Razorpay's
    // orders.create API on a monster user-agent or fbclid string.
    const notes: Record<string, string> = {
      kind: FUNNEL_KIND,
      cust: truncate(JSON.stringify({
        fn: customer?.firstName ?? '',
        ln: customer?.lastName ?? '',
        em: customer?.email ?? '',
        ph: customer?.phone ?? '',
        ct: customer?.city ?? '',
        co: customer?.countryCode ?? '',
        dl: customer?.dialCode ?? '',
        tp: customer?.customerType ?? '',
      })),
      utm: truncate(JSON.stringify({
        s: utm?.source   ?? '',
        m: utm?.medium   ?? '',
        c: utm?.campaign ?? '',
        n: utm?.content  ?? '',
        t: utm?.term     ?? '',
      })),
      clid: truncate(fbclid ?? ''),
      fbc: truncate(fbc),
      fbp: truncate(fbp),
      ip: truncate(clientIp),
      ua: truncate(clientUserAgent),
      esu: CANONICAL_CHECKOUT_URL,
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
