# Paste-ready prompt — hand this to a fresh Claude Code session along with `RAZORPAY_WEBHOOK_MIGRATION.md`

Copy the block below verbatim (including the fenced code) into a new Claude Code session that has this funnel's codebase open. Also attach the `RAZORPAY_WEBHOOK_MIGRATION.md` file.

---

```
You're implementing the Razorpay-webhook refactor documented in
RAZORPAY_WEBHOOK_MIGRATION.md (attached). This moves Pabbly + Meta CAPI
firing out of the browser-dependent /api/razorpay/verify-payment route
and into a server-to-server /api/razorpay/webhook route so we stop losing
UPI-app payers who never return to /thank-you.

Rules for this session:

1. Read RAZORPAY_WEBHOOK_MIGRATION.md end-to-end BEFORE doing anything
   else. It is the source of truth — every hard rule, notes-packing rule,
   file-by-file change, and verification step is in there.

2. Then AUDIT this project in READ-ONLY mode. Specifically read:
     - app/api/razorpay/verify-payment/route.ts (or equivalent)
     - app/api/razorpay/create-order/route.ts (or equivalent)
     - The checkout form component (typically components/CheckoutForm.tsx)
     - .env.local
     - Any config/lib the payment routes import
     - Any UTM / landing-param capture helper
   Do NOT write, edit, or delete anything yet.

3. Produce a SHORT summary to me (under 30 lines, no code, no preamble):
     - What the current payment flow does (1–3 bullets)
     - The files you'll change + a one-line note per file
     - The exact CURRENT Pabbly payload field list (as they appear today)
     - The exact CURRENT CAPI event name(s) fired today
     - Any project-specific deviation from the spec you'll need to make
       (e.g. "this project fires one event named 'Webinar Purchase' —
       I'll preserve that; not adding a second")
     - What I'll need to do after the code lands (Razorpay + Vercel)

4. STOP. Wait for me to explicitly approve your summary before touching
   code. Do not begin implementation on your own initiative, even if the
   summary seems obvious.

5. After my approval, execute exactly per section 6 of the migration doc.
   Preserve every existing event name, field name, event_id derivation,
   and external_id formula — do NOT rename or "improve" anything.

6. Run the project's build and the three curl tests (section 10 of the
   doc) before declaring done.

7. Do NOT commit or push unless I explicitly say so.

8. Once everything is verified, hand off with the exact user-side
   checklist from section 9 of the doc (Razorpay Dashboard + Vercel env
   + first-purchase verification + UPI stress test).

Confirm you've understood this workflow before doing anything else.
```

---

## Notes for the human doing the handoff

- The prompt is deliberately terse — the substance lives in `RAZORPAY_WEBHOOK_MIGRATION.md`. Attach both files to the same session so the agent has the reference.
- If the funnel is unusual (e.g. no test-mode gate, no MAM cookie, a second custom CAPI event, no `customerType` field), the agent will surface those deviations in step 3 — that's when you tell them how to handle each one.
- If the agent skips step 4 (starts coding without approval), interrupt and point them back at rule 4. Do not let them barrel through.
- After the agent hands off, your side is: Razorpay Dashboard → Settings → Webhooks (URL, `payment.captured`, secret) → Vercel env `RAZORPAY_WEBHOOK_SECRET` → deploy → real purchase → verify in Vercel logs + Pabbly + Meta Test Events → UPI stress test.
