'use client';

// =====================================================================
// GA4 — once-per-browser event helper.
//
// Fires window.gtag('event', <name>) at most once per browser lifetime,
// gated by a localStorage flag per event. Independent from Meta CAPI /
// Pixel dedup (separate flag namespace) so a Meta outage never suppresses
// GA4 and vice versa.
//
// Contract per the GA4 v2.0 brief:
//   1. Stamp the localStorage flag BEFORE calling gtag. A CTA click can
//      navigate away immediately after; an unstamped flag double-fires.
//   2. DO NOT stamp the flag when window.gtag is undefined (dev without
//      NEXT_PUBLIC_GA4_ID, staging with the trackingEnabled gate off).
//      Otherwise the event is permanently suppressed on that browser and
//      can never fire on production. Detect-absent → early return.
//   3. If localStorage throws (private mode, disabled storage) fire
//      anyway — an extra count beats a lost one.
//   4. Wrap the gtag call in try/catch. Analytics must never throw into
//      a click handler.
// =====================================================================

const FLAG_PREFIX = 'fm4_ga4_';

// The three events we currently track. Adding a new event = add its
// string literal here.
export type Ga4EventName =
  | 'add_to_cart'
  | 'initiate_checkout'
  | 'join_whatsapp';

type GtagFn = (...args: unknown[]) => void;

function getGtag(): GtagFn | undefined {
  if (typeof window === 'undefined') return undefined;
  const g = (window as unknown as { gtag?: GtagFn }).gtag;
  return typeof g === 'function' ? g : undefined;
}

export function trackGa4EventOnce(eventName: Ga4EventName): void {
  // SSR guard + gtag-absent guard (rule 2 — do NOT stamp the flag when
  // GA4 hasn't loaded, or we'd permanently suppress the event).
  const gtag = getGtag();
  if (!gtag) return;

  const flagKey = `${FLAG_PREFIX}${eventName}_fired`;

  // Rule 3: if localStorage throws (private mode, sandboxed iframe),
  // we still fire the event — best-effort dedup rather than a lost event.
  let alreadyFired = false;
  try {
    alreadyFired = localStorage.getItem(flagKey) !== null;
    if (!alreadyFired) {
      // Rule 1: stamp BEFORE calling gtag.
      localStorage.setItem(flagKey, '1');
    }
  } catch {
    // Storage broken → fall through to fire without dedup.
  }
  if (alreadyFired) return;

  // Rule 4: never throw into a click handler.
  try {
    gtag('event', eventName);
  } catch {
    // swallow
  }
}
