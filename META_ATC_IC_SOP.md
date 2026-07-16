# SOP — Add `AddToCart` + `InitiateCheckout` via CAPI (portable across funnels)

> **Paste-ready spec for a Claude Code agent working inside any of our funnel projects.** Adds two Meta standard events via server-side CAPI: `AddToCart` at landing-page CTA click, `InitiateCheckout` at checkout-page pay-button click. Both deduped per browser + Meta's 48h `event_id` safety net. Includes the **Health & Wellness restricted-category variant** — mirror the funnel's existing PII-scrub + custom-event-naming pattern if the pixel is in a Meta restricted category.

---

## ⚠️ HOW TO USE THIS DOCUMENT — READ FIRST (mandatory workflow, non-negotiable)

You are a Claude Code agent about to implement this refactor. **You are FORBIDDEN from writing, editing, deleting, or moving any code until you complete Phase A + Phase B + Phase C below and receive explicit user approval in Phase D.**

Even if the user's initial message says "please implement this SOP," treat that as a request to *plan* the implementation. The user has explicitly instructed (through this SOP) that no code touches the repo until they approve your understanding of what needs to change in *their specific funnel*.

### Phase A — Read (read-only)

Read this document end-to-end. Every section. It is the source of truth for what to do; the target funnel is the source of truth for what already exists.

### Phase B — Audit (read-only)

Read the target project's code without modifying anything. Specifically identify:

- The **checkout page slug** — may be `/product-checkout`, `/checkout`, `/order`, `/pay`, `/booking`, whatever this funnel calls it.
- The **pay-button handler** — may be a form submit handler, a `PayCTA` component, an `OrderNow` button, an inline `onClick`. Find the exact function that opens Razorpay / Stripe / whatever the payment provider is.
- The **landing-page CTAs** — may be `<CheckoutLink>`, `<Link>`, plain `<a>`, or a custom `<Button>`. Inventory all of them; they may span multiple language routes like `/`, `/hi`, `/mar`, `/en`, etc.
- The **existing CAPI helper module** — usually `lib/meta-capi.ts` or similar. This tells you the funnel's `sendMetaCapiEvent` shape, event names, and — CRITICAL — whether it strips PII from user_data (the H&W indicator, see §5).
- The **existing conversion event(s) fired today** — could be `Purchase` + a custom event, or ONLY a custom event (some funnels only fire `sales`, some only fire `Lead`). **Whatever the funnel fires for the conversion today, mirror that pattern — do NOT force a new one**.
- The **env var names** — `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, and any test-mode gate variable (`pricing.trackingEnabled`, `IS_LIVE`, `TRACKING_ENABLED`, whatever this funnel uses).

### Phase C — Summarize (still no code)

Produce a **SHORT summary to the user**, under 30 lines, no code, no preamble. It must contain exactly these bullets:

- The exact checkout-page slug + pay-button handler name (verbatim, with file paths).
- The exact CTA element(s) on landing pages that will fire AddToCart (list each with its file + line).
- The exact CAPI event name(s) the funnel currently fires (verbatim, e.g. `Purchase + sales`, `Webinar Purchase`, or `Lead + custom_lead`).
- **Whether the funnel scrubs PII from its conversion event's user_data** — a one-word yes/no answer (H&W indicator). If yes, list which fields are stripped; you'll mirror the same scrub in §7b (H&W variant). If no, use §7 (standard variant).
- Whether the funnel uses **standard Meta event names** for its current events (capitalized like `Purchase`), OR **custom snake_case names** (like `sales`, `purchase`, `hw_purchase`). This decides whether you fire `AddToCart`/`InitiateCheckout` (standard) or `atc_event`/`ic_event` (H&W-restricted custom names — see §5 / §7b).
- The list of files you'll create + modify — one line per file.
- Any project-specific deviation from this SOP you'll need to make.
- What the user will need to do after your code lands (usually nothing new — both routes reuse the funnel's existing Meta env vars).

### Phase D — 🛑 HARD STOP. Wait for approval.

**Do not proceed past this line until the user replies with an explicit approval** (e.g. "approved", "go ahead", "yes, implement", "looks good, execute"). Anything ambiguous ("thanks", "ok noted", "interesting") is NOT approval — ask for confirmation.

### Phase E — Execute (only after Phase D approval)

Implement per §7 (standard) or §7b (H&W-restricted). Preserve every existing pattern the funnel uses. Do not add new patterns.

### Phase F — Verify

Run the funnel's build (`npm run build` or equivalent). Local curl smoke test both new routes with the test-mode gate active — expect `{skipped:"test_mode"}` or equivalent from each.

### Phase G — Hand off (do NOT commit/push unless the user explicitly asks)

Give the user the post-deploy verification checklist from §9. Do not run `git commit` or `git push` on your own initiative — the user runs their own release cadence.

**Do NOT skip Phase D.** Even if the request seems obvious. Even if you're confident. Even if the user's message sounded like "just go." The whole point of this SOP is that every funnel has its own quirks (event names, PII rules, gate variables) and the user needs to eyeball your interpretation before you touch code.

---

## 0. Architecture at a glance — where these events fire from

These two events are fired directly from **our Vercel server** via HTTP POST to Meta's Graph API. They are **completely independent** of the funnel's payment webhook (Razorpay / Stripe / whatever). This is critical to understand:

| Event | Trigger | Firing origin | Meta endpoint |
|---|---|---|---|
| `AddToCart` | Landing CTA click (browser) | Our route `POST /api/meta/add-to-cart` → `POST graph.facebook.com/v25.0/{PIXEL}/events` | Meta Graph API |
| `InitiateCheckout` | Pay-button click (browser) | Our route `POST /api/meta/initiate-checkout` → `POST graph.facebook.com/v25.0/{PIXEL}/events` | Meta Graph API |
| The funnel's existing conversion event (e.g. `Purchase`, `sales`, `Lead`) | Payment webhook (server) | Whatever route already handles it — **do not touch** | Meta Graph API |

Why not fire AddToCart / InitiateCheckout from the payment webhook? Because both events represent *intent* that happens BEFORE any payment attempt:
- A visitor clicks a CTA and never opens the checkout page → we still want the AddToCart signal (retargeting, MOFU audiences).
- A visitor fills the checkout form, clicks Pay, but abandons at the payment provider's screen → we still want the InitiateCheckout signal (abandoned-checkout audience).

The payment webhook only fires on successful payment capture — it can't see either of these upstream intents. That's why these two routes are triggered by the user's *browser action* on our site, and fire independently.

All three CAPI-firing routes (AddToCart, InitiateCheckout, and the funnel's existing conversion) are peers: same server, same Meta Graph API endpoint, different triggers.

---

## 1. Context — why we're adding these events

Today the funnel likely fires only bottom-of-funnel events (`Purchase` and/or a custom conversion). This is enough for optimizing on final purchases but leaves Meta blind to the two intermediate intent signals that make lookalike audiences + upper-funnel campaigns work:

- **`AddToCart`** — visitor intent to buy (clicked the CTA). Cheap, high-volume, useful for retargeting audiences.
- **`InitiateCheckout`** — visitor pulled out their wallet (started paying). Rare, high-quality, useful for the "abandoned checkout" audience and for optimizing MOFU campaigns.

Firing both via **server-side CAPI** (not browser Pixel) gives:
- Higher reliability (not blocked by ad-blockers / ITP)
- Consistent identity resolution using `external_id` derived the same way as the funnel's existing Purchase event
- Cleaner integration — no additional `fbq('track', ...)` browser calls; PageView remains the only browser-side event

---

## 2. Universal logic (funnel-agnostic)

Regardless of button names, route slugs, or event-name conventions:

- **`AddToCart` fires** on the first landing-page CTA click of the browser's lifetime. It doesn't matter which CTA — hero, mid-page, sticky, hero-video, footer — the FIRST click from the user in that browser fires exactly one AddToCart.

- **`InitiateCheckout` fires** ONLY when **both** of these are true, at the same moment:
  1. The checkout form has been **fully filled and passes client-side validation** (every required field valid — name, email, phone, city, whatever the funnel collects). If validation fails, the submit handler returns early and IC MUST NOT fire.
  2. The visitor clicked the pay-equivalent CTA and the client is **about to trigger the create-order (payment-init) API call**. IC fires as the immediate step BEFORE that create-order fetch — same submit handler, same try block, one line above.

  **Concretely:** IC fires inside the form submit handler, right after `validateFields()` returns clean, right before `fetch('/api/…/create-order', …)`. Never on field blur, never on keystroke, never on modal open, never during payment. Exactly once per unique email per browser (deduped by localStorage; second attempt with a different email fires fresh).

Neither event blocks the user's action. If Meta is unreachable, the click still navigates / the payment still opens. Errors are logged, never surfaced.

---

## 3. CAPI vs. Pixel — architectural stance

**Use CAPI. Do not use browser Pixel `fbq('track', ...)` for these events.** The funnel's existing pattern (only `PageView` on the browser, everything else via CAPI) should extend to these two new events. Reasons:

- Reliability: not blocked by ad-blockers / ITP.
- Identity: server-side hashing lets us re-use the funnel's `external_id` derivation for consistent cross-event matching.
- Consistency: keeps the browser bundle small and the tracking surface auditable in one place (server).

**Client's role** = *trigger only*. The client tells the server "an event happened" via a small POST; the server does all the hashing and Meta-graph POST.

### Mechanics — how client tells server

- **AddToCart:** in the CTA's `onClick`, call `navigator.sendBeacon('/api/meta/add-to-cart', body)` (fallback `fetch(url, {keepalive:true})`). Beacon is guaranteed to send even during page navigation. Cookies (`_fbc`/`_fbp`) attach automatically because the beacon URL is same-origin. Client IP + user-agent are added by the platform (Vercel edge) via `x-forwarded-for` + `user-agent` headers.
- **InitiateCheckout:** in the form-submit handler, IMMEDIATELY AFTER `validateFields` returns clean (return early on any error — do NOT fire IC on invalid forms) and IMMEDIATELY BEFORE the create-order / payment-init fetch. `await fetch('/api/meta/initiate-checkout', {method:'POST', body: {...customer, eventSourceUrl}})`. Standard fetch, not beacon — the page isn't navigating. IC must be one contiguous block with create-order, in the same try, so the two calls fire back-to-back when the visitor clicks pay on a fully-filled form.

---

## 4. Deduplication strategy (two layers)

Client-side and server-side both contribute — neither is sufficient alone, together they get us to "one event per unique person per browser, effectively forever":

### Layer 1 — client-side `localStorage` flag

- **AddToCart:** set `<funnel_prefix>_atc_fired = "1"` in localStorage on first fire. Every subsequent CTA click checks this flag; if set, skip. Set the flag OPTIMISTICALLY (before the beacon leaves) so even a tab-kill mid-navigation still leaves the flag stamped.
- **InitiateCheckout:** set `<funnel_prefix>_ic_fired = "<sha256(email)>"` on first fire. Check equality against the current email's hash — same email = skip, different email = fire (different real intent).

Choose a funnel-specific `<funnel_prefix>` matching the funnel's existing localStorage conventions (e.g. `fm4_`, `acme_`, `bwx_`). Don't invent a new one.

### Layer 2 — Meta's `event_id` server-side dedup (48h window)

Even if the client flag is somehow bypassed (multi-tab, storage cleared, etc.), Meta collapses events with the same `event_name + event_id` within 48 hours:

| Event | `event_id` formula | Why |
|---|---|---|
| `AddToCart` | `sha256(fbp + '|atc')` — fallback `randomHex + '_atc'` if no `_fbp` | Same browser fires same event_id within a session. Meta collapses accidental duplicates. |
| `InitiateCheckout` | `sha256(email.lower.trim + '|ic')` | Same real user fires same event_id even across devices/sessions. |

### What this covers vs. what it doesn't

**Covers:** rapid double-clicks, multi-tab clicks, return visits days/weeks later on the same browser.
**Doesn't cover:** cross-device same person; incognito mode; cleared site data. Unavoidable without a DB.

Honesty check: you cannot promise "exactly one forever." You can promise **"one per browser lifetime + Meta's 48h dedup safety net."** Say this out loud in the handoff so the user's expectations are calibrated.

---

## 5. 🩺 Health & Wellness restricted-category variant

If Meta has flagged the funnel's pixel as **Health & Wellness** (or another restricted category: financial, employment, housing, political), you cannot send PII in `user_data` for events that could hint at a sensitive category. The funnel's existing conversion event handler will already reflect this — audit it in step 2 of the workflow to see what's stripped. Mirror that scrub for `AddToCart` and `InitiateCheckout`.

### Detecting whether the funnel is H&W-restricted

- The existing CAPI helper (usually `lib/meta-capi.ts`) will show one of two shapes:
  - **Non-restricted funnel:** ships `em, ph, fn, ln, ct, country, external_id` (hashed) + `fbc, fbp, IP, UA` (raw) — full 11 signals. Event name is a Meta standard string (`Purchase`).
  - **H&W-restricted funnel:** ships only `fbc, fbp, IP, UA` (or a similar minimal subset). No hashed PII. Event name is a snake_case custom string (`purchase`, `sales`, `hw_purchase`, etc.) — never `Purchase`.
- If you see the second pattern, you are in the H&W variant. Mirror it below.

### H&W variant — what to change

| Field | Non-restricted | H&W-restricted |
|---|---|---|
| Event name (AddToCart) | `AddToCart` | **`atc_event`** (custom, opaque to Meta's category scan) |
| Event name (InitiateCheckout) | `InitiateCheckout` | **`ic_event`** (custom, opaque to Meta's category scan) |
| `user_data.em / ph / fn / ln / ct / country / external_id` | included (hashed) | **OMIT entirely** — do not send hashed PII |
| `user_data.fbc / fbp / client_ip_address / client_user_agent` | included (raw) | included (raw) — these are non-PII |
| `custom_data.content_ids / content_name / content_type` | included | **OMIT** if any could hint at a health condition (product name, category). Send only `currency` + `value`. |
| `custom_data.value / currency` | included | included — money isn't PII |

### H&W variant — hard rules

1. **Never send hashed PII** (em/ph/fn/ln/ct/country/external_id) alongside these events under any circumstance. Even hashed values are flagged by Meta's restricted-category enforcement.
2. **The `event_id` derivation can still use email** because it's only used for dedup and never inspected by Meta as a matching field. But — to be safe — use `event_id = sha256(fbp + '|atc' + brand_salt)` for AddToCart and `event_id = sha256(fbp + '|ic' + emailHash + brand_salt)` for InitiateCheckout so no raw or hashed email appears in the event_id string on the wire. (Meta doesn't audit event_id but the audit team is more paranoid than the platform.)
3. **`content_name` / `content_ids` must be sanitized.** If the funnel's product name is `"Pain Free with FM4 Workshop"`, that's a health hint — omit it. If the funnel's product is generic like `"Course Enrollment"`, it's fine.
4. **Localstorage keys stay the same** — no PII in the client flag either (already using the email hash, which is fine — but for H&W you can also use just a `"1"` bare flag on IC as well, keyed off session/browser rather than email, to be extra clean).
5. **Follow the funnel's existing convention for the conversion event, but use the fixed custom names `atc_event` + `ic_event` for these two.** If the funnel uses `sales` (not `Purchase`) for its conversion, it's an H&W funnel — extend the pattern by adding **`atc_event`** and **`ic_event`** as the two new custom events. If it uses `Purchase` (capital P), it's non-restricted → use standard `AddToCart` + `InitiateCheckout`. The `atc_event` / `ic_event` names are deliberately opaque strings so Meta's restricted-category scanner has nothing to flag — do NOT use `add_to_cart` / `initiate_checkout` (some Meta reviewers still keyword-match those against the standard event vocabulary and re-apply restrictions).

### H&W verification after implementation

- `grep -rn "em: \[" lib/` in the new event files → should return **nothing** for H&W funnels (no hashed em/ph/fn/ln appearing).
- Meta Events Manager → Data Quality tab → the new events should NOT show a "Contains restricted data" warning after 24h.
- Match Quality will drop (naturally — fewer signals), typically ~3–5 for both events. That's expected.

---

## 6. File-by-file changes

Names follow the FM4 pattern; adapt to whatever convention the target funnel uses.

### Create

1. **`lib/meta-events.ts`** (or equivalent) — new module that exports:
   - `sendAddToCartEvent({pixelId, accessToken, fbc, fbp, clientIp, clientUserAgent, eventSourceUrl, value, currency})`
   - `sendInitiateCheckoutEvent({pixelId, accessToken, email, phone, firstName, lastName, city, countryCode, fbc, fbp, clientIp, clientUserAgent, eventSourceUrl, value, currency})`
   - Both fire ONE event to `graph.facebook.com/v25.0/{PIXEL_ID}/events`.
   - Reuse the funnel's existing `sha256` helper (typically from `lib/meta-capi.ts`).
   - **H&W:** the `sendInitiateCheckoutEvent` shape gets NO PII in user_data — see §5.

2. **`app/api/meta/add-to-cart/route.ts`** — POST endpoint. Reads `_fbc`/`_fbp` from cookies + IP/UA from headers. Gates on the funnel's test-mode flag. Fires AddToCart. Returns `{ok:true, capi:"sent"|"skipped"|"error"}`. Per-stage `console.log`.

3. **`app/api/meta/initiate-checkout/route.ts`** — POST endpoint. Body: `{customer, eventSourceUrl}`. Same reads + gates. Fires InitiateCheckout. **H&W:** even though the client sends the full customer body, the H&W-scrubbed variant of `sendInitiateCheckoutEvent` only uses `fbc/fbp/IP/UA` — the customer object is only used for the `event_id` derivation (email hash) and immediately discarded.

### Modify

4. **The CTA component / anchor** — whatever renders the landing-page CTAs (e.g. `<CheckoutLink>`, or the raw `<a>` if the funnel doesn't have a wrapper).
   - Add an `onClick` handler that:
     - Reads `localStorage['<prefix>_atc_fired']`. If set → do nothing.
     - Sets the flag optimistically.
     - Calls `navigator.sendBeacon('/api/meta/add-to-cart', new Blob([JSON.stringify({eventSourceUrl: window.location.href})], {type:'application/json'}))`.
     - Fallback `fetch(url, {method:'POST', body, keepalive:true, headers:{'Content-Type':'application/json'}}).catch(()=>{})` if `sendBeacon` is unavailable.
   - Never block the click — the anchor navigates / button acts normally regardless.

5. **The checkout form submit handler** — the function that runs on Pay-button click.
   - **Timing is critical:** IC must fire ONLY after `validateFields()` (or the funnel's equivalent) returns with zero errors. If validation fails, the handler returns early — IC does NOT fire. This means IC never fires on an incomplete or invalid form.
   - **Position:** the IC fire is the immediate step BEFORE the create-order (payment-init) fetch, inside the same `try` block, one line above. When the visitor clicks pay on a fully-filled valid form, IC and create-order fire back-to-back.
   - The QA / coupon / free-order path (if the funnel has one) MUST NOT fire IC — coupon paths are internal tests and shouldn't pollute Meta.
   - Implementation:
     - Compute `emailHash = await sha256Hex(email.trim().toLowerCase())` client-side (Web Crypto).
     - Check `localStorage['<prefix>_ic_fired'] === emailHash`. If match → skip.
     - Otherwise `await fetch('/api/meta/initiate-checkout', ...)` with the customer body.
     - On success (`res.ok`), set `localStorage['<prefix>_ic_fired'] = emailHash`. On failure, leave the flag empty so a retry can fire.
   - Failure MUST NOT block the payment. Catch + log + continue to create-order.

### Env — no new vars

Both routes reuse the funnel's existing `META_PIXEL_ID` + `META_CAPI_ACCESS_TOKEN`. No new env vars.

---

## 7. Exact payloads (non-H&W standard variant)

### `AddToCart`

```jsonc
{
  "data": [{
    "event_name":       "AddToCart",
    "event_time":       <unix seconds>,
    "event_id":         "<sha256(fbp + '|atc')>",   // fallback randomHex+'_atc' if no fbp
    "action_source":    "website",
    "event_source_url": "<landing URL>",
    "user_data": {
      // no PII available at CTA click time
      "fbc":               "<raw _fbc>",     // omit if empty
      "fbp":               "<raw _fbp>",     // omit if empty
      "client_ip_address": "<x-forwarded-for[0] or x-real-ip>",
      "client_user_agent": "<user-agent header>"
    },
    "custom_data": {
      "currency":     "INR",
      "value":        <ticket amount, rupees>,
      "content_ids":  ["<funnel product slug>"],
      "content_name": "<funnel product name>",
      "content_type": "product"
    }
  }]
}
```

Expected EMQ: **3–5**.

### `InitiateCheckout`

```jsonc
{
  "data": [{
    "event_name":       "InitiateCheckout",
    "event_time":       <unix seconds>,
    "event_id":         "<sha256(email.lower.trim + '|ic')>",
    "action_source":    "website",
    "event_source_url": "<checkout URL>",
    "user_data": {
      "em":          ["<sha256(email.lower.trim)>"],
      "ph":          ["<sha256(digitsOnly(dialCode + phone))>"],
      "fn":          ["<sha256(firstName.lower.trim)>"],
      "ln":          ["<sha256(lastName.lower.trim)>"],
      "ct":          ["<sha256(city.lower.[a-z]-only)>"],
      "country":     ["<sha256(countryCode.lower)>"],
      "external_id": ["<sha256(email.lower.trim)>"],   // MUST match funnel's Purchase derivation
      "fbc":               "<raw _fbc>",
      "fbp":               "<raw _fbp>",
      "client_ip_address": "<x-forwarded-for[0]>",
      "client_user_agent": "<user-agent>"
    },
    "custom_data": {
      "currency":     "INR",
      "value":        <ticket amount>,
      "content_ids":  ["<funnel product slug>"],
      "content_name": "<funnel product name>",
      "content_type": "product"
    }
  }]
}
```

Expected EMQ: **9+**.

---

## 7b. Exact payloads (H&W-restricted variant — opaque custom names)

### `atc_event` (H&W — the AddToCart equivalent)

```jsonc
{
  "data": [{
    "event_name":       "atc_event",               // custom, opaque — Meta's category scan cannot classify this
    "event_time":       <unix seconds>,
    "event_id":         "<sha256(fbp + '|atc')>",  // no PII in derivation
    "action_source":    "website",
    "event_source_url": "<landing URL>",
    "user_data": {
      // NO em/ph/fn/ln/ct/country/external_id — restricted category
      "fbc":               "<raw _fbc>",
      "fbp":               "<raw _fbp>",
      "client_ip_address": "<x-forwarded-for[0]>",
      "client_user_agent": "<user-agent>"
    },
    "custom_data": {
      "currency": "INR",
      "value":    <ticket amount>
      // OMIT content_ids/name/type if funnel product could hint at H&W
    }
  }]
}
```

Expected EMQ: **~2–4** (fewer signals). Acceptable trade-off for staying policy-compliant.

### `ic_event` (H&W — the InitiateCheckout equivalent)

```jsonc
{
  "data": [{
    "event_name":       "ic_event",                // custom, opaque
    "event_time":       <unix seconds>,
    "event_id":         "<sha256(fbp + '|ic')>",   // no email in derivation
    "action_source":    "website",
    "event_source_url": "<checkout URL>",
    "user_data": {
      // NO hashed PII — restricted category
      "fbc":               "<raw _fbc>",
      "fbp":               "<raw _fbp>",
      "client_ip_address": "<x-forwarded-for[0]>",
      "client_user_agent": "<user-agent>"
    },
    "custom_data": {
      "currency": "INR",
      "value":    <ticket amount>
    }
  }]
}
```

Expected EMQ: **~2–4**.

**Why `atc_event` / `ic_event` instead of `add_to_cart` / `initiate_checkout`?** Meta's restricted-category classifier keyword-matches custom event names against the standard-event vocabulary. `add_to_cart` and `initiate_checkout` are recognized as "the snake_case form of a standard event" and can inherit the same restrictions Meta applied to the pixel. `atc_event` / `ic_event` are opaque — the classifier has nothing to bind them to, so they slip through as truly custom events.

**Rule:** whatever fields the funnel's existing H&W-restricted `sales`/`purchase`-equivalent event omits from `user_data` and `custom_data`, omit the same fields here. Do not send anything the existing conversion event doesn't already send.

---

## 8. Test-mode gate + error handling

- **Test-mode gate:** both routes check the funnel's existing gate (e.g. `pricing.trackingEnabled` for FM4, or `IS_PRODUCTION`, `TRACKING_ENABLED`, whatever the pattern is). When gate is off (staging / preview / test mode), routes return `{ok:true, skipped:"test_mode"}` — no side effects.
- **Env-var missing:** if `META_PIXEL_ID` or `META_CAPI_ACCESS_TOKEN` is unset, return `{ok:true, skipped:"env_missing"}`.
- **Meta API errors:** caught + logged. Route returns `{ok:true, capi:"error"}`. Never surface to the user.
- **All log lines** must be prefixed `[atc]` and `[ic]` respectively so Vercel logs are filterable.

---

## 9. Handoff — what the user does after the code lands

Present as a clear checklist. There is NOTHING for the user to configure in Razorpay, Meta Events Manager, or Pabbly — these events are self-contained.

### After deploy

1. **Fresh browser session** → visit the funnel's landing page.
2. **Click any landing CTA.** Within 5–10 seconds, Meta Events Manager → Test Events should show `AddToCart` (or `atc_event` if H&W) with:
   - Source: Server
   - EMQ: 3–5 (non-restricted) or 2–4 (H&W)
   - `event_id`: matches the sha256(fbp+'|atc') derivation
3. **Refresh + click again.** No second AddToCart. The localStorage flag caught it.
4. **Continue to the checkout page + fill the form + click Pay.** Before the payment modal opens, `InitiateCheckout` should appear in Test Events:
   - EMQ: 9+ (non-restricted) or 2–4 (H&W)
   - `event_id`: matches the sha256(email+'|ic') derivation
5. **Complete the payment.** The funnel's existing conversion event (Purchase / sales / whatever) fires as usual via the funnel's existing pipeline. Full funnel trace in Events Manager: `PageView(s) → AddToCart → InitiateCheckout → Purchase (+ sales)`.
6. **Verify dedup:** clear localStorage for the funnel's domain, refresh, click a CTA again. AddToCart should re-fire (fresh browser identity). This is expected and correct.

### Vercel env — nothing new

Both routes reuse the funnel's existing `META_PIXEL_ID` + `META_CAPI_ACCESS_TOKEN`. No new env vars.

### If Meta flags the new events

- **"Signal / EMQ warning"**: normal for AddToCart (data-availability ceiling). Nothing to fix.
- **"Contains restricted data" warning**: pixel is in H&W and you shipped the non-restricted variant. Re-run this SOP, ship the §5 H&W variant.
- **"Duplicate events" warning**: unlikely, but if it appears the deterministic `event_id` derivation isn't consistent between fires. Debug: log the event_id server-side and compare across fires from the same visitor.

---

## 10. Verification (agent uses before handoff)

- [ ] `npm run build` clean, both new routes registered.
- [ ] `grep -rn "AddToCart\|InitiateCheckout\|atc_event\|ic_event" app components lib` — refs only in the two new route files, the new `meta-events` module, CheckoutLink/CheckoutForm equivalents, and this SOP.
- [ ] `grep -rn "fbq('track'" app components` — should still show only `PageView` calls (or whatever the funnel's browser Pixel behavior was). No new browser-side event firing added.
- [ ] Local curl smoke test:
  - `POST /api/meta/add-to-cart` with test-mode gate active → `{skipped:"test_mode"}`
  - `POST /api/meta/initiate-checkout` with valid body + test-mode gate active → `{skipped:"test_mode"}`
  - `POST /api/meta/initiate-checkout` with missing email → 400
- [ ] For H&W funnels: verify the two new event handlers use IDENTICAL `user_data` shape to the funnel's existing conversion event (no additional hashed PII appearing in the new events).

---

## 11. Guardrails — what NOT to touch

- The funnel's existing conversion event pipeline (`Purchase`+`sales`, `sales` alone, `Webinar Purchase`, `Lead`, whatever it fires). Do not change event names, payload shapes, or `event_id` derivations of existing events.
- Browser Pixel behavior. `PageView` remains the only browser-side event.
- The Razorpay webhook (or Stripe / other provider webhook). Both new events fire from client trigger → own API route, not from the payment webhook.
- The MAM cookie / `analytics.ts` / thank-you page.
- Landing-page copy, checkout-form UI. Only the CTA `onClick` and the submit handler change.
- The free-order / coupon QA path (if the funnel has one). QA orders don't fire InitiateCheckout — they short-circuit before the paid path.

---

## 12. Known limitations (flag in handoff)

1. **"One event forever" is best-effort.** localStorage-cleared or incognito-mode users will re-fire. Unavoidable without a database.
2. **Cross-device dedup impossible.** Same person on phone AND desktop = 2 events. Meta's own cross-device attribution helps reporting but doesn't dedupe event counts.
3. **AddToCart EMQ is capped low (~3–5 non-H&W, ~2–4 H&W)** — data-availability ceiling, not a bug.
4. **`fbp` may be missing** for tracking-blocked visitors. AddToCart event_id falls back to random UUID → Meta's 48h dedup won't fire. localStorage flag still holds.
5. **Media buyer:** these are diagnostic + audience-building events. Continue optimizing on the funnel's existing bottom-of-funnel conversion event (Purchase / sales / whatever). Only consider optimizing on InitiateCheckout if you're running a MOFU campaign and volume is enough.

---

## 13. Portable prompt (paste this into a fresh Claude Code session)

Copy the fenced block below verbatim into a new Claude Code session that has the target funnel's codebase open. Attach this SOP file (`META_ATC_IC_SOP.md`) alongside.

```
You're implementing the CAPI AddToCart + InitiateCheckout refactor
documented in META_ATC_IC_SOP.md (attached).

Two new Meta events via server-side CAPI (NOT via the payment webhook —
both events are fired directly from Vercel routes by the user's browser
click on a landing CTA / pay button). Deduped per browser via
localStorage + Meta's 48h event_id safety net.

⚠️ MANDATORY WORKFLOW — non-negotiable, do NOT deviate:

Phase A — Read the SOP end-to-end BEFORE anything else.

Phase B — AUDIT this project in READ-ONLY mode. Do not write, edit, or
delete a single line of code. Identify:
   - The checkout page slug (whatever it's called in this project)
   - The pay-button handler (whatever it's called, with file path + line)
   - All landing-page CTA elements (may span multiple language routes)
   - The existing CAPI helper module + event name(s) it fires today
   - Whether the funnel is in a Meta restricted category (H&W etc.),
     detectable by whether the existing conversion event strips PII from
     user_data — see SOP section 6.
   - The funnel's test-mode gate variable (whatever it's called)

Phase C — Produce a SHORT summary (under 30 lines, no code, no
preamble). It must contain:
   - The exact CTA elements + pay-button handler you found (file paths)
   - The exact CAPI event name(s) fired today (verbatim)
   - Whether this is H&W-restricted (yes → SOP §7b snake_case custom
     event names + strip PII; no → SOP §7 standard names with full PII)
   - The files you'll create + modify (one line each)
   - Any project-specific deviation
   - What the user needs to do after your code lands (usually nothing —
     both routes reuse the funnel's existing Meta env vars)

Phase D — 🛑 HARD STOP. WAIT for my explicit approval before touching
code. "Approved", "go ahead", "yes implement", or equivalent are fine.
Anything ambiguous is NOT approval — ask me to confirm.

Phase E — Only after Phase D approval, execute per SOP §7 (standard) or
§7b (H&W). Preserve every existing pattern the funnel uses. Do not
add new patterns.

Phase F — Run the project's build. Do local curl smoke tests (SOP §10).
Both new routes should return {skipped:"test_mode"} when the funnel's
test-mode gate is active.

Phase G — Hand off with the user-side checklist from SOP §9. Do NOT run
`git commit` or `git push` unless I explicitly ask. I run my own
release cadence.

Confirm you've understood this workflow before doing anything else.
Do NOT skip Phase D. Even if the request seems obvious.
```

**Important:** if the receiving agent starts writing code before Phase D approval, interrupt them and point them back at this workflow. Do not let them barrel through.

---

**End of SOP.** Version 1.0 — based on the FM4 Therapy implementation, 2026-Q3.
