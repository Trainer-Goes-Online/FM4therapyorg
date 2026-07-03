# Migration Spec — `verify-payment` → Razorpay Webhook (universal funnel refactor)

> **This document is a paste-ready spec for a Claude Code agent working inside any of our funnel projects.** It describes the exact refactor to move Pabbly + Meta CAPI firing out of the browser-dependent `verify-payment` route and into a Razorpay-triggered server-to-server webhook. Every funnel in our portfolio should end up on this architecture.

---

## ⚠️ HOW TO USE THIS DOCUMENT — READ FIRST (mandatory workflow)

You are a Claude Code agent about to implement this refactor. **Do not touch code yet.** Follow this workflow in order:

1. **Read this document end-to-end.** Every section. It is the source of truth.
2. **Audit the target project** in read-only mode. Specifically find and read:
   - The payment-verify route (typically `app/api/razorpay/verify-payment/route.ts`)
   - The create-order route (typically `app/api/razorpay/create-order/route.ts`)
   - The checkout form component (typically `components/CheckoutForm.tsx`)
   - `.env.local` (or equivalent) — inventory the env var names
   - Any config/lib files the payment routes import
   - Any UTM/param capture helper (typically `lib/utm.ts`)
3. **Produce a SHORT summary to the user** covering:
   - What the current flow does (1–3 bullets)
   - The list of files you'll change, with a one-line note on each
   - The exact set of fields currently in the Pabbly payload (list them)
   - The exact CAPI event name(s) currently fired
   - Any **project-specific deviation** from this spec you'll need to make (e.g. "this project fires ONE CAPI event named 'Webinar Purchase' — I'll preserve that; do NOT add a second event")
   - What the user will need to do after your code lands (Razorpay Dashboard + Vercel env)
4. **WAIT for the user to approve your summary.** Do not start writing code until they explicitly say "go" / "approved" / equivalent.
5. **Only after approval, execute** in the order given in §6 below. Prefer one commit total, or one commit per logical step — ask the user which they prefer.
6. **After the code is done + build passes + local curl test passes**, hand off with the exact list of user actions (§9 below).

**Rules for step 3 (the summary):** keep it under 30 lines. No code snippets. No preamble. This is a scoping check-in, not a plan document — the plan document is the file you're reading.

**Do NOT skip step 4.** Even if the request seems obvious. The user wants a checkpoint before you touch code.

---

## 1. Context — why we're doing this

**Problem:** Today, Pabbly + Meta CAPI fire from `verify-payment/route.ts`, which is called by the checkout form *after the Razorpay modal's success handler returns*. When a user pays via a UPI app (GPay, PhonePe, Paytm), they often complete the payment inside the UPI app and never come back to the funnel tab. The Razorpay handler callback never fires → `verify-payment` is never hit → Pabbly gets no row, Meta CAPI gets no Purchase event — even though Razorpay collected the money. We're silently losing conversion signal for a real chunk of buyers.

**Fix:** Move "fire Pabbly + Meta CAPI" out of `verify-payment` (browser-dependent) and into a **Razorpay-triggered webhook** (server-to-server, independent of the user's browser). Because the merchant's Razorpay account can receive payments from other funnels/apps/payment-links, we tag *our* orders with `notes.kind = "client_funnel"` at order-create time so the webhook can ignore everything else that isn't ours.

**Outcome:** Every successful purchase originating in this funnel fires Pabbly + CAPI exactly once, regardless of whether the user returned to `/thank-you`. Same Pabbly payload fields as today, same CAPI event(s) as today, same EMQ.

---

## 2. Architecture change (one diagram)

```
BEFORE (broken for UPI-away users):
  Checkout → create-order → Razorpay modal → PAY
                                                │
                                                ├─ user returns → verify-payment → Pabbly + CAPI + redirect
                                                └─ user gone   → NOTHING (lost lead)

AFTER (webhook-driven):
  Checkout → create-order (packs customer + tracking data into
              Razorpay order.notes, tagged kind:"client_funnel")
              → Razorpay modal → PAY
                                    │
                                    ├─ Razorpay → POST /api/razorpay/webhook  ← server→server, always fires
                                    │              → HMAC verify → kind gate → Pabbly + CAPI
                                    │
                                    └─ user returns → client redirects to /thank-you (no side effects)
```

Server-to-server means the webhook fires regardless of whether the user's browser is still open. Razorpay's infra retries the webhook on non-200 responses. UPI-away users are covered.

---

## 3. Hard rules (do NOT skip)

1. **Preserve every existing field name in the Pabbly payload.** If today's payload has 20 fields, tomorrow's has the same 20 fields (plus possibly a handful you add per §5 packing). If today it has 30 fields, tomorrow has 30. Do not rename, remove, or reorder. Pabbly's downstream mapping is column-name-based.
2. **Preserve every existing CAPI event.** If the project fires ONE event named `"Webinar Purchase"`, you fire ONE event named `"Webinar Purchase"` in the webhook. If it fires TWO events (`Purchase` + a custom name), fire TWO. Do not change event names. Do not add new events. Do not remove any.
3. **Preserve `event_id` derivation.** Whatever the project uses today for `event_id` (typically the Razorpay `payment_id`), keep it. Meta's dedup depends on it.
4. **`kind: "client_funnel"` is a universal literal.** Same string in every funnel. Do not derive per-funnel. Each funnel has its own Razorpay account + webhook URL + secret, so isolation is at the account level; the sentinel just filters out non-funnel payments within that one account.
5. **`external_id` derivation must stay consistent** with any browser-side MAM code if the project has it. Typically `sha256(email.trim().toLowerCase())`. Do not change the formula.
6. **Do NOT alter the browser-side Pixel behavior.** The client PageView / MAM cookie / thank-you page all stay untouched. The webhook is server-only.
7. **Do NOT alter the free-order / coupon path** if the project has one. Those routes are QA-only and independent.
8. **Test-mode gate:** if the project has a `PRICE_INR=1` (or similar) test-mode short-circuit in the existing verify-payment route, preserve the same behavior in the webhook — early-return without firing Pabbly or CAPI.

If any hard rule pulls against what the codebase actually does, flag it in your step-3 summary. Do not silently deviate.

---

## 4. The `kind` sentinel — why + how

A merchant's Razorpay account can receive payments from many sources:
- Direct payment links
- Invoices
- Other integrations / other funnels sharing the account
- Manual "pay by link" refunds and adjustments

If the webhook fires for **every** captured payment on the account, Pabbly gets rows for unrelated payments and Meta CAPI gets Purchase events with no matching order data — inflated conversion counts and polluted rows.

**Fix:** at order-create time, set `notes.kind = "client_funnel"` on the Razorpay order. The webhook reads `payment.entity.notes.kind` and short-circuits (returns 200 with an "ignored" reason) for anything else.

Razorpay propagates order notes to the payment entity automatically — so the webhook's `payload.payment.entity.notes` contains what create-order set on the order.

---

## 5. Notes packing strategy (Razorpay's 15-key / 256-char limits)

**Confirmed from Razorpay docs:** the `notes` object is capped at **15 key-value pairs, 256 characters per value**. Since a typical funnel needs to move ~20 fields (customer + UTM + attribution + tracking) from the checkout form through the order into the webhook, we consolidate into JSON blobs.

**The universal 9-key notes payload:**

| # | Key | Contents | Approx size | Maps in Pabbly to |
|---|---|---|---|---|
| 1 | `kind` | `"client_funnel"` (literal) | 13 | (gate only — not written to sheet) |
| 2 | `cust` | `JSON.stringify({fn, ln, em, ph, ct, co, dl, tp})` | ~150 | first_name, last_name, email, phone, city, country_code, dial_code, customer_type (+ derived full_name) |
| 3 | `utm` | `JSON.stringify({s, m, c, n, t})` | ~120 | utm_source, utm_medium, utm_campaign, utm_content, utm_term |
| 4 | `clid` | fbclid (truncated ≤256) | ≤256 | fbclid |
| 5 | `fbc` | raw `_fbc` cookie | ≤256 | fbc |
| 6 | `fbp` | raw `_fbp` cookie | ~50 | fbp |
| 7 | `ip` | client IP (first entry of `x-forwarded-for`, fallback `x-real-ip`) | ≤45 | client_ip_address |
| 8 | `ua` | user-agent (**truncated to 256**) | ≤256 | client_user_agent |
| 9 | `esu` | **canonical** checkout URL (no query string) | ≤80 | event_source_url |

**6 key-slots remain free** for future additions.

**Key trim rules (non-negotiable):**

- **`esu` must be a canonical URL** (e.g. `https://www.<funnel-domain>/product-checkout`). Do NOT store the full `window.location.href` — real URLs routinely exceed 256 chars because they include the entire query string (`?utm_*&fbclid=…`). The query-string data is preserved in the `utm` and `clid` notes anyway, so no downstream data is lost. Meta CAPI's `event_source_url` is a metadata field (not a matching signal) — zero EMQ impact from canonicalizing.
- **`ua` must be truncated to 256** defensively. Instagram / Facebook in-app browser UAs routinely exceed 256 chars. Meta CAPI matching is prefix-tolerant — negligible EMQ impact.
- **`clid` and `fbc` must also be defensively truncated to 256** even though they typically fit. Never send a raw string that could crash `razorpay.orders.create`.
- **Empty values:** send `""` (never `undefined`). Consistent with today's Pabbly schema.

**If the funnel doesn't currently capture some field:** omit it from the notes. Do not fabricate values. E.g. if the checkout form doesn't collect `customerType`, drop `tp` from the `cust` blob — do not force it in.

**Why JSON blobs for `cust` + `utm` and not individual keys?** Fitting 8 customer keys + 5 UTM keys individually would leave zero note-budget for `fbc`/`fbp`/`ua`/`esu`/`clid`/`ip`. Blobs keep the notes count small and leave headroom.

---

## 6. File-by-file changes

### 6.1 Create `lib/meta-capi.ts` (extract shared logic)

Extract `sendMetaCapiEvent` + `sha256` + shared types (`CustomerData`, `UtmData`) from the doomed `verify-payment/route.ts` into a new module. **Preserve the function body byte-for-byte** — same payload shape, same event name(s), same hashing. The new webhook route will import from here.

If the project's `verify-payment` fires a single event, the extracted `sendMetaCapiEvent` fires a single event. If it fires two (Purchase + custom), extract exactly what's there. Do not "improve" the CAPI logic during extraction.

### 6.2 Rewrite `app/api/razorpay/create-order/route.ts`

Currently accepts `{amount, currency}`. Rewrite to accept:
```
{
  amount, currency,
  customer: { firstName, lastName, email, phone, city, countryCode, dialCode, customerType? },
  utm: { source, medium, campaign, content, term },
  fbclid
}
```

Server-side reads:
- `_fbc` and `_fbp` from request cookies
- Client IP from `x-forwarded-for`[0] or `x-real-ip`
- User agent from `user-agent` header

Build the 9-key notes per §5 (with truncation). Pass `notes` in `razorpay.orders.create({ amount, currency, receipt, notes })`. Return response unchanged.

### 6.3 Refactor the checkout form

Two changes:

**A. `handleSubmit` — send extended body to create-order:**
```
body: JSON.stringify({
  amount, currency,
  customer: {
    firstName: fields.firstName.trim(),
    lastName:  fields.lastName.trim(),
    email:     fields.email.trim(),
    city:      fields.city.trim(),
    phone:     fields.phone.trim(),
    countryCode,
    dialCode:  selected.dial,
    customerType: fields.customerType,  // if collected
  },
  utm: restoreUtm(),                    // or equivalent helper
  fbclid: restoreLandingParams()?.fbclid ?? '',
})
```

**B. `handlePaymentSuccess` — remove verify-payment fetch:**
The Razorpay success handler no longer calls `/api/razorpay/verify-payment`. It just refreshes MAM (if the project has MAM) and redirects to `/thank-you`. The webhook is now the sole tracking authority.

Free-order / coupon paths — untouched.

### 6.4 Delete `app/api/razorpay/verify-payment/route.ts`

Delete the file AND the containing empty directory. The webhook replaces it completely.

### 6.5 Create `app/api/razorpay/webhook/route.ts`

The new tracking authority. Pipeline in order (each step short-circuits with 200 or 400):

1. **HMAC signature verify.** Read raw body via `req.text()` (crucial — do not `req.json()` first, HMAC needs the raw bytes). Compute `HMAC-SHA256(rawBody, process.env.RAZORPAY_WEBHOOK_SECRET)`. Compare to `x-razorpay-signature` header. Mismatch → 400 `{ok: false, error: "invalid_signature"}`.
2. **Event filter.** Parse JSON. If `event !== 'payment.captured'`, return 200 `{ok: true, ignored: true, reason: "event_not_captured", event}`.
3. **Extract `payment.entity`.** If missing → 400 `{ok: false, error: "no_payment_entity"}`.
4. **Kind gate.** Read `payment.notes.kind`. If not `"client_funnel"` → return 200 `{ok: true, ignored: true, reason: "kind_mismatch", kind}`.
5. **Test-mode gate** (if the project has one). Same behavior as the old verify-payment's test-mode short-circuit.
6. **Unpack notes.** Parse `notes.cust` and `notes.utm` (JSON.parse, defensive — wrap in try/catch, fallback to empty object). Read individual notes: `clid`, `fbc`, `fbp`, `ip`, `ua`, `esu`.
7. **Compute server-derived fields:**
   - Amount: `Math.round(payment.amount / 100)` (Razorpay sends paise, Pabbly + CAPI want rupees). Payment.amount may be number OR string in some SDK versions — handle both.
   - Currency: `payment.currency` (fallback to project's default if empty).
   - Timestamps: `payment.created_at` is Unix seconds. Multiply by 1000 for Date. Format `payment_date`/`payment_time`/`payment_timestamp` in the same timezone the old verify-payment used (typically `Asia/Kolkata`).
   - `external_id`: `sha256(cust.em.trim().toLowerCase())` — MUST match whatever formula the project already uses.
8. **Build the Pabbly payload** with the **exact same field names and shape** as the project's old verify-payment payload. Nothing renamed, nothing removed.
9. **Fire Pabbly** (POST to `process.env.PABBLY_WEBHOOK_URL`, non-blocking — wrap in try/catch, log result, do not throw).
10. **Fire Meta CAPI** via the extracted `sendMetaCapiEvent`. Non-blocking. Skip cleanly if `META_PIXEL_ID` or `META_CAPI_ACCESS_TOKEN` is missing.
11. **Return a self-documenting confirmation JSON:**
    ```
    {
      ok: true,
      paymentId,
      kind: "client_funnel",
      pabbly: "sent" | "skipped" | "error",
      capi:   "sent" | "skipped" | "error"
    }
    ```
12. **`console.log` at every stage** — signature verified, kind matched, Pabbly result, CAPI result. Every log line MUST include the `paymentId` so a Vercel-log search by paymentId reconstructs the full trace.

### 6.6 Env vars

Add to `.env.local` (or the project's equivalent):
```
RAZORPAY_WEBHOOK_SECRET=
```
Leave empty — the user fills it after generating a secret in Razorpay dashboard.

---

## 7. Idempotency + duplicates (known limitation, not a blocker)

Razorpay retries webhooks on non-200 responses (and occasionally otherwise). Meta CAPI dedupes on `event_id = paymentId` within a 48h window — **safe**. **Pabbly may see duplicate rows** because there's no server-side dedup. Since these projects have no database, we accept this and let Pabbly's downstream workflow filter/dedupe on `lead_id` (or `payment_id`), OR the downstream CRM sheet's Apps Script (if present) dedupes on its own `_sent` flag.

Flag this in your handoff — the user should be aware.

---

## 8. Workflow the agent MUST follow (repeat for clarity)

1. Read this document.
2. Audit the target project (READ-ONLY).
3. Produce a short summary (see §HOW TO USE THIS DOCUMENT above).
4. **Stop. Wait for the user to approve.**
5. Execute the code changes in §6 order.
6. Run the project's build. Must pass.
7. **Local curl test** (see §10 verification). Must show:
   - Valid HMAC + `kind:"client_funnel"` → 200 with confirmation JSON (or `skipped:"test_mode"` if the test-mode gate is present and PRICE=1)
   - Valid HMAC + `kind:"other_funnel"` → 200 with `ignored:true, reason:"kind_mismatch"`
   - Tampered signature → 400 with `error:"invalid_signature"`
8. Hand off — give the user the checklist in §9.

Do NOT commit/push unless the user explicitly asks. Even after everything works locally.

---

## 9. Handoff — what the user does after code lands

Present this as a clear checklist:

### On Razorpay Dashboard

1. **Log in** to the funnel's Razorpay Dashboard.
2. **Settings → Webhooks → Add New Webhook.**
3. **URL:** `https://<production-domain>/api/razorpay/webhook`
   *(You need the funnel's actual production domain — ask the user if you don't know it.)*
4. **Alert Email:** the funnel's ops email.
5. **Active Events:** check ONLY `payment.captured`. Do not check `payment.failed` or others unless the user asks.
6. **Secret:** either type a strong random string OR let Razorpay generate one. **Copy this value** — it's only shown once in most flows.
7. Save.

### On Vercel

1. **Project → Settings → Environment Variables → Production.**
2. Add:
   ```
   Name:  RAZORPAY_WEBHOOK_SECRET
   Value: <the secret you copied from Razorpay>
   ```
3. Save. **Trigger a redeploy** (Vercel usually does this automatically, but confirm).

### Preview environment (optional)

Skip unless the user asks. If they do want it:
- Add a second webhook in Razorpay pointing at the Vercel preview URL (which is a hash — not a stable target).
- OR use a tunnel (`cloudflared tunnel --url http://localhost:3000` / `ngrok http 3000`) for one-off local tests.
- If preview is set up: mirror `RAZORPAY_WEBHOOK_SECRET` in Vercel Preview env vars, and if the project has a test-mode gate (e.g. `PRICE_INR=1`), keep it enabled on preview so ₹1 test payments don't pollute production Events Manager / Pabbly.

### `.env.local` (local dev, optional)

Local dev only benefits from a webhook secret if the user runs a tunnel. Otherwise leave blank — Razorpay can't reach localhost.

### First-time verification (right after deploy)

1. Make ONE real purchase for the funnel's live price.
2. **In Vercel logs**, filter for `/api/razorpay/webhook`. You should see, for that payment ID:
   ```
   [webhook] signature verified
   [webhook] paymentId=pay_xxx kind matched: client_funnel
   [webhook] paymentId=pay_xxx Pabbly sent (200)
   [webhook] paymentId=pay_xxx Meta CAPI sent (…event name(s)…)
   ```
   And the response body JSON showing `pabbly:"sent", capi:"sent"`.
3. **In Pabbly task history:** one new row for that payment ID with every expected field populated.
4. **In Meta Events Manager → Test Events:** the expected CAPI event(s) arrive within seconds with the payment ID as the `event_id`. EMQ should match what the funnel had before the refactor.
5. **UPI stress test:** on a real payment, force-close the browser tab mid-Razorpay-modal (or use a UPI QR + external UPI app). Confirm the webhook still fires and Pabbly + CAPI still land. This is the raison d'être of the refactor — if this doesn't work, the refactor is broken.

---

## 10. Verification checklist (agent uses this before handoff)

**Static:**
- [ ] `npm run build` clean, route count unchanged (−1 verify-payment, +1 webhook).
- [ ] `grep -rn "verify-payment" app components lib` → no code references (comments are OK; update stale ones).
- [ ] `grep -rn "sendMetaCapiEvent" app lib` → exactly one definition (`lib/meta-capi.ts`) and exactly one call site (`app/api/razorpay/webhook/route.ts`).

**Local curl (dev server + Node script generating correct HMAC):**
- [ ] Case A — valid HMAC, `kind:"client_funnel"`, PRICE-gate-enabled if applicable → 200 with confirmation JSON (or `skipped:"test_mode"` if gate is on).
- [ ] Case B — valid HMAC, `kind:"other_funnel"` → 200 `{ignored:true, reason:"kind_mismatch"}`.
- [ ] Case C — tampered signature → 400 `{error:"invalid_signature"}`.

**Payload equivalence (SANITY):**
- [ ] Diff the current verify-payment Pabbly payload vs. what the webhook route will produce for the same customer inputs. Every key that exists today MUST exist tomorrow. If you added new keys (per §5), list them in your handoff so the user knows to map them in Pabbly.

---

## 11. Guardrails — what NOT to touch

- The two-events-vs-one-event pattern of the existing CAPI firing.
- Any `event_name` string. Preserve verbatim.
- `event_id` derivation.
- `external_id` derivation.
- Browser Pixel behavior (PageView, MAM cookie, thank-you tracker).
- Free-order / coupon-bypass routes.
- Landing pages, checkout form UI (only the two handler functions inside CheckoutForm change).
- Thank-you page (except updating stale comments that referenced `verify-payment`).
- Any downstream Apps Script / Google Sheet CRM. The SOURCE of the Pabbly writes moves from `verify-payment` to `webhook`, but the payload names are identical, so downstream tooling doesn't notice.

---

## Appendix A — reference "before" and "after" file shapes

The exact `verify-payment/route.ts` and `create-order/route.ts` files you'll delete/rewrite look substantially like this baseline (the details vary by funnel):

**Before — `create-order/route.ts` (simplified baseline):**
```ts
export async function POST(req: NextRequest) {
  // ...
  const { amount = 9700, currency = 'INR' } = body;
  const order = await razorpay.orders.create({ amount, currency, receipt });
  return NextResponse.json({ orderId: order.id, ... });
}
```

**After — `create-order/route.ts` (this refactor):**
```ts
export async function POST(req: NextRequest) {
  // ... read extended body: {amount, currency, customer, utm, fbclid}
  // ... read cookies: fbc, fbp
  // ... read headers: clientIp, clientUserAgent
  const notes = {
    kind: 'client_funnel',
    cust: JSON.stringify({fn, ln, em, ph, ct, co, dl, tp}),
    utm:  JSON.stringify({s, m, c, n, t}),
    clid: truncate(fbclid),
    fbc:  truncate(fbc),
    fbp:  truncate(fbp),
    ip:   truncate(clientIp),
    ua:   truncate(clientUserAgent),
    esu:  'https://<funnel-domain>/product-checkout',
  };
  const order = await razorpay.orders.create({ amount, currency, receipt, notes });
  return NextResponse.json({ orderId: order.id, ... });
}
```

**Before — `verify-payment/route.ts`:** HMAC verify → build Pabbly payload → fire Pabbly → fire CAPI.

**After — `verify-payment/route.ts`:** deleted.

**After — `webhook/route.ts`:** HMAC verify → event filter → kind gate → test-mode gate → unpack notes → build same Pabbly payload → fire Pabbly → fire CAPI → return confirmation JSON.

---

## Appendix B — troubleshooting common failure modes (for the handoff)

If the user reports…

- **"No Pabbly rows arriving after a real payment":** check Vercel logs for the webhook route. Almost always the signature is failing (either the secret in Vercel doesn't match the one saved in Razorpay, or someone edited the code so the raw body is being re-serialized before HMAC).
- **"Kind mismatch on every payment":** create-order isn't setting notes correctly. Check by manually inspecting a recent Razorpay order in the dashboard — expand the "Notes" section, confirm `kind: client_funnel` is present.
- **"CAPI events firing with `event_source_url` = the canonical URL":** this is CORRECT. §5 says why. UTM data is preserved in the `utm` note.
- **"UA truncated in Pabbly":** correct — see §5. Truncation to 256 is the trade-off for staying under Razorpay's per-value limit.
- **"Webhook fires twice for the same payment":** Razorpay retries. Meta dedupes on `event_id`; Pabbly may show duplicates — filter in Pabbly workflow on `payment_id` / `lead_id`.

---

**End of migration spec.**
Version: 1.0 (based on the FM4 Therapy migration, 2026-Q3).
