import crypto from 'crypto';
import { sha256 } from './meta-capi';

// =====================================================================
// Meta CAPI — upper-funnel standard events (AddToCart + InitiateCheckout).
//
// Deliberately in a sibling module (not lib/meta-capi.ts) because these
// events serve a different pipeline than Purchase + sales:
//   - AddToCart fires at landing-CTA click time, when we have NO PII —
//     only fbc/fbp/IP/UA are available. EMQ is capped ~3–5 by design.
//   - InitiateCheckout fires at the pay-button click on /product-checkout,
//     after the form is filled — full 11-signal payload, EMQ 9+.
//
// Both are one event per POST, action_source: "website".
// event_id is derived deterministically so Meta's 48h dedup catches any
// accidental double-fires (the client also holds a localStorage flag for
// forever-per-browser dedup — see components/CheckoutLink.tsx and
// components/CheckoutForm.tsx).
// =====================================================================

const META_GRAPH_VERSION = 'v25.0';

// Standard custom_data across both events — identifies the single
// product line every FM4 order buys.
const CONTENT_IDS = ['fm4_workshop'];
const CONTENT_NAME = 'Pain Free with FM4 Workshop';
const CONTENT_TYPE = 'product';

// ────────────────────────────────────────────────────────────────────
// AddToCart — landing-page CTA click
// ────────────────────────────────────────────────────────────────────
export async function sendAddToCartEvent(params: {
  pixelId: string;
  accessToken: string;
  fbc: string | undefined;
  fbp: string | undefined;
  clientIp: string | undefined;
  clientUserAgent: string | undefined;
  eventSourceUrl: string;
  value: number;
  currency: string;
}) {
  // Deterministic event_id keyed on fbp so Meta dedupes rapid re-fires
  // from the same browser within its 48h window. Fallback: random hex
  // when the visitor has no fbp cookie (e.g. tracking-blocked); in that
  // case we accept losing Meta's 48h dedup safety net — the client-side
  // localStorage flag still prevents client re-fires.
  const eventId = params.fbp
    ? sha256(params.fbp + '|atc')
    : crypto.randomBytes(16).toString('hex') + '_atc';

  const event = {
    event_name:       'AddToCart',
    event_time:       Math.floor(Date.now() / 1000),
    event_id:         eventId,
    action_source:    'website',
    event_source_url: params.eventSourceUrl,
    user_data: {
      // No PII available at CTA click time — only anonymous signals.
      ...(params.fbc && { fbc: params.fbc }),
      ...(params.fbp && { fbp: params.fbp }),
      ...(params.clientUserAgent && { client_user_agent: params.clientUserAgent }),
      ...(params.clientIp        && { client_ip_address: params.clientIp }),
    },
    custom_data: {
      currency:     params.currency,
      value:        params.value,
      content_ids:  CONTENT_IDS,
      content_name: CONTENT_NAME,
      content_type: CONTENT_TYPE,
    },
  };

  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${params.pixelId}/events?access_token=${params.accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [event] }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(JSON.stringify(err));
  }
  return res.json();
}

// ────────────────────────────────────────────────────────────────────
// InitiateCheckout — pay-button click on /product-checkout
// ────────────────────────────────────────────────────────────────────
export async function sendInitiateCheckoutEvent(params: {
  pixelId: string;
  accessToken: string;
  email: string;
  phone: string;          // dial code + number, raw
  firstName: string;
  lastName: string;
  city: string;
  countryCode: string;    // 2-letter ISO
  fbc: string | undefined;
  fbp: string | undefined;
  clientIp: string | undefined;
  clientUserAgent: string | undefined;
  eventSourceUrl: string;
  value: number;
  currency: string;
}) {
  const normalisedEmail = params.email.trim().toLowerCase();
  const hashedEmail = sha256(normalisedEmail);

  const rawPhone = params.phone.replace(/\D/g, '');
  const hashedPhone = rawPhone ? sha256(rawPhone) : undefined;

  // external_id: same derivation as Purchase + browser MAM — Meta caches
  // one external_id → Facebook-user mapping across all our events.
  const externalId = sha256(normalisedEmail);

  const fn = params.firstName.trim().toLowerCase();
  const ln = params.lastName.trim().toLowerCase();
  const ct = params.city.trim().toLowerCase().replace(/[^a-z]/g, '');
  const country = params.countryCode.trim().toLowerCase();

  const hashedFn      = fn      ? sha256(fn)      : undefined;
  const hashedLn      = ln      ? sha256(ln)      : undefined;
  const hashedCt      = ct      ? sha256(ct)      : undefined;
  const hashedCountry = country ? sha256(country) : undefined;

  // Deterministic event_id keyed on email — same visitor's second Place
  // Order click within 48h collapses to one event server-side, on top of
  // the client's localStorage flag.
  const eventId = sha256(normalisedEmail + '|ic');

  const event = {
    event_name:       'InitiateCheckout',
    event_time:       Math.floor(Date.now() / 1000),
    event_id:         eventId,
    action_source:    'website',
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
      currency:     params.currency,
      value:        params.value,
      content_ids:  CONTENT_IDS,
      content_name: CONTENT_NAME,
      content_type: CONTENT_TYPE,
    },
  };

  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${params.pixelId}/events?access_token=${params.accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [event] }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(JSON.stringify(err));
  }
  return res.json();
}
