# Plan — Add `AddToCart` and `InitiateCheckout` via CAPI (no browser Pixel)

> **Nothing executed. Waiting for approval.**

## Context

Today we fire two conversion events (`Purchase` + `sales`) via server-side CAPI from `/api/razorpay/webhook`, deduped by Razorpay `payment_id`. The user wants two additional Meta standard events, also via CAPI:

- **`AddToCart`** — when a visitor clicks *any* landing-page CTA (hero, mid-page, sticky).
- **`InitiateCheckout`** — when a visitor clicks **"Place Your Order"** on `/product-checkout` (after filling the form, right before the Razorpay modal opens).

Constraints from the user:
- CAPI only. No browser-Pixel firing. No Meta Event Setup Tool.
- **One event per unique person, forever** (or as close as we can get without a database).
- Do NOT touch the existing `Purchase` + `sales` firing in `/api/razorpay/webhook`.

---

## Answering "can we do this via CAPI?"

**Yes — both events, cleanly.** Both need a *trigger point* on the client (there's no way for the server to know when a button was clicked without the client telling it), but the actual Meta event ships from the server. This is textbook CAPI usage — the "S" in "server-side" means the payload leaves *our* server, not that the trigger has to be server-side.

Flow for each event:
```
Client-side click → fetch our new API route → server fires CAPI to Meta
```

---

## Design decision — CAPI vs. Pixel (per-event honesty)

### `AddToCart` (landing-page CTA click)
- At CTA click time, we have **zero PII** (no form filled yet).
- Signals available: `_fbc` cookie (if from an FB ad), `_fbp` cookie, client IP, user-agent. That's **3–4 signals**.
- **Expected EMQ: ~3–5** — genuinely low, because that's all Meta has to match.
- CAPI vs. Pixel here: same signal set. CAPI wins on reliability (not blocked by ad-blockers, no ITP loss) but doesn't add matching quality — we have nothing extra to hash.
- **Recommendation:** still fire via CAPI as the user specified. Accept the low EMQ — it's the ceiling for an anonymous event.

### `InitiateCheckout` (checkout-form "Place Order" click)
- At click time, we have **the full form**: firstName, lastName, email, phone, city, country, plus cookies + IP + UA.
- Full **11 signals** available — identical to what `Purchase` carries.
- **Expected EMQ: 9+** — same as our current `Purchase` event.
- CAPI vs. Pixel: CAPI is strictly better here (same 11 signals, plus reliability).

---

## Deduplication strategy — the hard part (honest tradeoffs)

The user wants "one event per unique person, forever." Absolute uniqueness across devices, browsers, and cleared cookies is **impossible without a database** (which this project explicitly doesn't have). What we CAN achieve is a two-layer defense that gets us most of the way there.

### Layer 1 — `localStorage` "already fired" flag (client-side, forever)

- On successful fire, set a flag in `localStorage`:
  - `fm4_atc_fired = "1"` (bare flag — set once, never expires until user clears)
  - `fm4_ic_fired = "<sha256(email)>"` (stores the hash of the email that fired IC, so if the user retries with a different email we fire fresh — same real person, different intent)
- Every subsequent click on any CTA (or Place Order) checks the flag first. If set, silently no-op.

**Covers:** rapid double-clicks, multi-tab clicks in the same browser, return visits days/weeks/months later — same browser + intact `localStorage` = one event, ever.
**Does NOT cover:** user on a different device, incognito mode, cleared site data. That's unavoidable without server-side user tracking.

### Layer 2 — Meta's `event_id` dedup (server-side within 48h)

Meta dedupes events with the same `event_name + event_id` within a 48h window. We derive deterministic event_ids:

| Event | `event_id` formula | Why |
|---|---|---|
| `AddToCart` | `sha256(fbp + "|atc")` (fallback random if no `_fbp`) | fbp is per-browser-per-day-ish, so same browser fires same event_id within a session. Meta collapses accidental duplicates. |
| `InitiateCheckout` | `sha256(email + "|ic")` | Same email = same event_id. Even if the client dedup flag somehow got cleared, Meta still collapses within 48h. |

### Combined effect

| Scenario | Result |
|---|---|
| User clicks hero + mid-page + sticky CTA in one session | 1 AddToCart (localStorage catches clicks 2+) |
| User returns tomorrow and clicks again | 1 AddToCart still (localStorage persists) |
| User clears cookies + storage + returns | 2 AddToCart (unavoidable — new identity from Meta's POV too) |
| User pays without clearing anything | 1 AddToCart + 1 InitiateCheckout + 1 Purchase + 1 sales |
| User opens 3 tabs of `/product-checkout`, hits Place Order in each | 1 InitiateCheckout (localStorage), and even if 2 slipped through, Meta collapses on the shared event_id |
| User with different email in same session | 1 AddToCart + up to 2 InitiateCheckout (different email hashes → different event_ids and different flags) |

**Honesty check:** we cannot promise "exactly one forever." We can promise "one per browser lifetime + Meta dedup safety net."

---

## Files to create / modify (no code written yet)

### Create

1. **`lib/meta-events.ts`** (new)
   Small module wrapping `sendMetaCapiEvent`-style logic for these two additional standard events. Same graph version, same hashing helpers, but the event names/`event_id` derivation/`custom_data` shape differ from the Purchase pipeline, so keeping them separate avoids overloading `lib/meta-capi.ts`.

   Exports two functions:
   - `sendAddToCartEvent({ pixelId, accessToken, fbp, fbc, clientIp, clientUserAgent, eventSourceUrl, value, currency })`
   - `sendInitiateCheckoutEvent({ pixelId, accessToken, email, phone, firstName, lastName, city, countryCode, fbp, fbc, clientIp, clientUserAgent, eventSourceUrl, value, currency })`

   Both fire ONE event to `graph.facebook.com/v25.0/{PIXEL_ID}/events`.

2. **`app/api/meta/add-to-cart/route.ts`** (new)
   POST endpoint. No body (or minimal body — just optional `eventSourceUrl`). Reads `_fbc`/`_fbp` from cookies + IP/UA from headers. Gates on `pricing.trackingEnabled` (same as webhook). Fires `AddToCart` via `sendAddToCartEvent`. Returns confirmation JSON. Per-stage `console.log`.

3. **`app/api/meta/initiate-checkout/route.ts`** (new)
   POST endpoint. Body: `{customer: {firstName, lastName, email, phone, city, countryCode, dialCode}, eventSourceUrl}`. Reads `_fbc`/`_fbp`/IP/UA server-side. Gates on `pricing.trackingEnabled`. Fires `InitiateCheckout` via `sendInitiateCheckoutEvent`. Returns confirmation JSON.

### Modify

4. **`components/CheckoutLink.tsx`** — add an `onClick` handler that:
   - Reads `localStorage.fm4_atc_fired`. If set → allow navigation, do nothing else.
   - Otherwise: `navigator.sendBeacon('/api/meta/add-to-cart', ...)` (fire-and-forget, survives navigation).
   - Set `localStorage.fm4_atc_fired = "1"` optimistically **before** the beacon, so even if the beacon dies the flag prevents re-firing.
   - Never block the click — the anchor navigates normally either way.

5. **`components/CheckoutForm.tsx`** — inside `handleSubmit`, after validation passes but **before** the `/api/razorpay/create-order` fetch:
   - Compute `emailHash = sha256(email.trim().toLowerCase())` client-side via Web Crypto (already used by `lib/analytics.ts`).
   - Read `localStorage.fm4_ic_fired`. If it equals the current `emailHash` → skip.
   - Otherwise: `await fetch('/api/meta/initiate-checkout', ...)` with the full customer body.
   - Set `localStorage.fm4_ic_fired = emailHash` on success.
   - Do NOT block payment on failure — log and continue to Razorpay.

**Nothing else changes.** No routes touched, no webhook touched, no config file touched (except reusing `pricing.trackingEnabled`).

---

## Exact CAPI payloads

### `AddToCart` (single event per POST)

```jsonc
{
  "data": [{
    "event_name":       "AddToCart",
    "event_time":       <unix seconds>,
    "event_id":         "<sha256(fbp + '|atc')>",   // fallback to sha256(crypto.randomUUID() + '|atc') if fbp missing
    "action_source":    "website",
    "event_source_url": "<landing URL from client>",  // e.g. https://www.fm4therapyindia.org/
    "user_data": {
      // NO em/ph/fn/ln/ct/country/external_id — we have no PII at CTA click time.
      "fbc":               "<raw _fbc cookie>",       // omit if empty
      "fbp":               "<raw _fbp cookie>",       // omit if empty
      "client_ip_address": "<first x-forwarded-for or x-real-ip>",
      "client_user_agent": "<user-agent header>"
    },
    "custom_data": {
      "currency":     "INR",
      "value":        97,
      "content_ids":  ["fm4_workshop"],
      "content_type": "product",
      "content_name": "Pain Free with FM4 Workshop"
    }
  }]
}
```

Expected EMQ: **3–5** (unavoidable at CTA click).

### `InitiateCheckout` (single event per POST)

```jsonc
{
  "data": [{
    "event_name":       "InitiateCheckout",
    "event_time":       <unix seconds>,
    "event_id":         "<sha256(email.lower().trim() + '|ic')>",
    "action_source":    "website",
    "event_source_url": "<checkout URL, e.g. https://www.fm4therapyindia.org/product-checkout>",
    "user_data": {
      "em":          ["<sha256(email.lower().trim())>"],
      "ph":          ["<sha256(digitsOnly(dialCode + phone))>"],
      "fn":          ["<sha256(firstName.lower().trim())>"],
      "ln":          ["<sha256(lastName.lower().trim())>"],
      "ct":          ["<sha256(city.lower().[a-z]-only)>"],
      "country":     ["<sha256(countryCode.lower())>"],
      "external_id": ["<sha256(email.lower().trim())>"],   // same as em, matches Purchase's derivation
      "fbc":               "<raw _fbc cookie>",
      "fbp":               "<raw _fbp cookie>",
      "client_ip_address": "<x-forwarded-for[0] or x-real-ip>",
      "client_user_agent": "<user-agent header>"
    },
    "custom_data": {
      "currency":     "INR",
      "value":        97,
      "content_ids":  ["fm4_workshop"],
      "content_type": "product",
      "content_name": "Pain Free with FM4 Workshop"
    }
  }]
}
```

Expected EMQ: **9+** (same 11-signal payload as Purchase).

---

## Gates + guardrails preserved

- **Test-mode gate:** both new routes check `pricing.trackingEnabled` (i.e. `PRICE_INR > 1`). When `PRICE_INR=1` (preview / staging), the routes early-return with `{ok:true, skipped:"test_mode"}` — same behavior as the webhook. No test-payment noise in Events Manager.
- **Env-var missing:** if `META_PIXEL_ID` or `META_CAPI_ACCESS_TOKEN` isn't set, log and skip (like the webhook does).
- **Failure isolation:** Meta API errors are caught + logged, never surface to the user. AddToCart failure does NOT block navigation. InitiateCheckout failure does NOT block payment.
- **Log traceability:** every stage `console.log`s (`[atc] fired`, `[ic] fired paymentId=<none>`, etc.) so Vercel logs are a per-visitor trace.
- **`external_id` consistency:** InitiateCheckout uses `sha256(lower(trim(email)))` — same derivation as Purchase/sales + browser MAM cookie. Meta sees one stable per-user identity across all our events.

---

## What we're NOT touching (hard rule)

- `/api/razorpay/webhook` — the Purchase + sales firing stays byte-for-byte identical.
- `/api/razorpay/create-order` — the notes-packing stays as-is.
- `components/ThankYouTracker.tsx` — still only fires `PageView` (never Purchase from browser).
- `lib/meta-capi.ts` — kept for the existing Purchase + sales pipeline. New events go in a sibling `lib/meta-events.ts` to keep concerns separate.
- Browser Pixel behavior — still only `PageView`. No `fbq('track', 'AddToCart')` or `fbq('track', 'InitiateCheckout')` anywhere. All new firing is via server CAPI as the user requested.

---

## Verification plan (after implementation)

1. `npm run build` clean.
2. `grep -rn "fbq('track'" app components` → should still show only `PageView` calls.
3. `grep -rn "AddToCart\|InitiateCheckout" app components lib` → refs only in the new files.
4. Local curl smoke tests:
   - `POST /api/meta/add-to-cart` with `PRICE_INR=1` → 200 `{skipped:"test_mode"}`.
   - `POST /api/meta/initiate-checkout` with `PRICE_INR=1` + valid body → same.
5. On production deploy with a real visit (PRICE=97):
   - Click any CTA → Meta Events Manager → Test Events shows `AddToCart` within seconds.
   - Refresh + click again → NO second `AddToCart` (localStorage flag active).
   - Fill checkout + click Place Order → `InitiateCheckout` fires. EMQ 9+.
   - Complete payment → `Purchase` + `sales` fire via webhook (unchanged path).
   - Full funnel visible in Events Manager: `PageView(s) → AddToCart → InitiateCheckout → Purchase → sales`.

---

## Known limitations (flag to user before executing)

1. **"One event forever" is best-effort.** localStorage-cleared or incognito-mode users will re-fire. This is unavoidable without a database.
2. **Cross-device dedup impossible.** Same person on phone AND desktop will fire both events twice — once per device. Meta's cross-device attribution (via matched user_data hashes) helps on the reporting side but doesn't dedupe the event count.
3. **AddToCart EMQ will be low (~3–5).** This is a data-availability ceiling, not a code problem. If you want higher, we'd need a soft opt-in earlier in the funnel (e.g. an email gate before showing pricing) which fundamentally changes the funnel — out of scope.
4. **`fbp` may be missing** for visitors with tracking blockers. AddToCart event_id then falls back to random UUID, which weakens Meta's 48h dedup. localStorage flag still holds.
5. **We're using CAPI without a browser dedup partner.** For `Purchase` we don't fire browser Purchase either — same posture. Trade-off is clean but any accidental server double-fire relies on Meta's event_id dedup alone (48h window).
6. **New Meta noise: 2 extra events per visitor.** Events Manager will show `AddToCart` and `InitiateCheckout` volumes noticeably. Confirm the media buyer wants to optimize on any of these (usually optimizes on Purchase — these two are for funnel diagnostics + audience-building lookalikes).

---

## Steps if approved

1. Create `lib/meta-events.ts` with the two `send*` helpers (mirror `sendMetaCapiEvent` structure).
2. Create `app/api/meta/add-to-cart/route.ts`.
3. Create `app/api/meta/initiate-checkout/route.ts`.
4. Update `components/CheckoutLink.tsx` with the onClick beacon + localStorage flag.
5. Update `components/CheckoutForm.tsx` with the pre-create-order InitiateCheckout call + localStorage flag.
6. `npm run build`.
7. Local curl smoke test (PRICE=1 gate check).
8. Wait for user to say "commit + push."

Nothing above is implemented yet. This document is the plan.
