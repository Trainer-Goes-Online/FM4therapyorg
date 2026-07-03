import crypto from 'crypto';

// =====================================================================
// Meta Conversions API — shared server-side helper.
//
// Fires TWO events per successful purchase in a single HTTP POST:
//   1. Purchase — standard, optimizer target (global ML priors)
//   2. sales    — custom, internal source-of-truth label
// Both share event_id (= razorpay payment_id) so they dedupe against any
// browser-side event of the same event_name+event_id (we don't fire any
// by default — server is the sole conversion signal).
//
// user_data ships 11 matching signals:
//   Hashed (SHA-256 hex): em, ph, fn, ln, ct, country, external_id
//   Raw (no hash):        fbc, fbp, client_ip_address, client_user_agent
// =====================================================================

export const CUSTOM_EVENT_NAME = 'sales';
export const META_GRAPH_VERSION = 'v25.0';

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export interface CustomerData {
  firstName: string;
  lastName: string;
  email: string;
  city: string;
  phone: string;
  countryCode: string;
  dialCode: string;
  customerType: string; // "Myself" | "Loved One"
}

export interface UtmData {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

export async function sendMetaCapiEvent(params: {
  pixelId: string;
  accessToken: string;
  paymentId: string;
  email: string;
  phone: string;          // dial code + number, raw
  firstName: string;
  lastName: string;
  city: string;
  countryCode: string;    // 2-letter ISO
  eventSourceUrl: string;
  value: number;          // verified amount in major units (rupees, not paise)
  currency: string;       // verified currency ISO code, e.g. INR
  fbc: string | undefined;
  fbp: string | undefined;
  clientIp: string | undefined;
  clientUserAgent: string | undefined;
}) {
  const normalisedEmail = params.email.trim().toLowerCase();
  const hashedEmail = sha256(normalisedEmail);

  // Phone: digits only (E.164 without +) before hashing.
  const rawPhone = params.phone.replace(/\D/g, '');
  const hashedPhone = rawPhone ? sha256(rawPhone) : undefined;

  // external_id: stable per-user identifier. Must match the browser MAM
  // value (which uses the same sha256(email) derivation in lib/analytics.ts).
  const externalId = sha256(normalisedEmail);

  const fn = params.firstName.trim().toLowerCase();
  const ln = params.lastName.trim().toLowerCase();
  const ct = params.city.trim().toLowerCase().replace(/[^a-z]/g, '');
  const country = params.countryCode.trim().toLowerCase();

  const hashedFn      = fn      ? sha256(fn)      : undefined;
  const hashedLn      = ln      ? sha256(ln)      : undefined;
  const hashedCt      = ct      ? sha256(ct)      : undefined;
  const hashedCountry = country ? sha256(country) : undefined;

  const baseEvent = {
    event_time: Math.floor(Date.now() / 1000),
    event_id: params.paymentId,
    action_source: 'website',
    event_source_url: params.eventSourceUrl,
    user_data: {
      em: [hashedEmail],
      ...(hashedPhone   && { ph:      [hashedPhone] }),
      ...(hashedFn      && { fn:      [hashedFn] }),
      ...(hashedLn      && { ln:      [hashedLn] }),
      ...(hashedCt      && { ct:      [hashedCt] }),
      ...(hashedCountry && { country: [hashedCountry] }),
      external_id: [externalId],
      ...(params.fbc && { fbc: params.fbc }),
      ...(params.fbp && { fbp: params.fbp }),
      ...(params.clientUserAgent && { client_user_agent: params.clientUserAgent }),
      ...(params.clientIp        && { client_ip_address: params.clientIp }),
    },
    custom_data: {
      currency:   params.currency,
      value:      params.value,
      payment_id: params.paymentId,
    },
  };

  const events = [
    { ...baseEvent, event_name: 'Purchase' },
    { ...baseEvent, event_name: CUSTOM_EVENT_NAME },
  ];

  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${params.pixelId}/events?access_token=${params.accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: events }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(JSON.stringify(err));
  }
  return res.json();
}
