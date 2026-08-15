import { NextResponse, type NextRequest } from 'next/server';
import {
  ATTR_COOKIE,
  ATTR_TTL_SECONDS,
  mergeAttribution,
  parseAttributionFromUrl,
  readAttrCookie,
} from '@/lib/attribution';

// =====================================================================
// L1 — Edge middleware attribution capture.
//
// Runs at the edge on every landing-page (and other same-origin nav)
// request BEFORE any React renders. Reads utm_*/fbclid/gclid from the
// query string and stamps them into a first-party `fm4_attr` cookie
// (30-day TTL, SameSite=Lax, JS-readable).
//
// Fixes the fundamental race documented in FUNNEL_ATTRIBUTION_AUDIT §1:
//   - Old flow: capture ran in a React useEffect → lost to hydration
//     races on Facebook/Instagram in-app browsers → blank UTMs in Pabbly
//     and CRM even on real ad conversions.
//   - New flow: capture runs at the edge → the server has seen the
//     query string before the response headers leave; the cookie is set
//     in the same response that renders the landing page → nothing to
//     race against.
//
// Cookie semantics (see lib/attribution.mergeAttribution):
//   - utm_*/fbclid/gclid = LAST-touch (a new tagged URL overwrites).
//   - landing_url + referrer = FIRST-touch (stamped once, never wiped).
//   - A clean internal nav with no tagged query does NOT write the cookie
//     — no churn, no bloat.
// =====================================================================

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  try {
    const live    = parseAttributionFromUrl(req.nextUrl.search);
    const stored  = readAttrCookie(req.cookies.get(ATTR_COOKIE)?.value);
    const referer = req.headers.get('referer') || '';

    const { attr, changed } = mergeAttribution(stored, {
      live,
      landingUrl: req.nextUrl.href,
      referrer:   referer,
      now:        Date.now(),
    });

    if (changed) {
      res.cookies.set(ATTR_COOKIE, encodeURIComponent(JSON.stringify(attr)), {
        path:     '/',
        maxAge:   ATTR_TTL_SECONDS,
        sameSite: 'lax',
        // JS-readable on purpose — a client fallback (form-fill capture)
        // can read the same cookie without depending on server calls.
        httpOnly: false,
        secure:   req.nextUrl.protocol === 'https:',
      });
    }
  } catch {
    // Never let attribution capture break a page render.
  }

  return res;
}

// Skip:
//   - Next internals (_next/static, _next/image)
//   - API routes (already same-origin, cookie auto-attaches)
//   - favicon
//   - Any request whose last path segment has an extension — matches all
//     files under public/ (images, css, js, webp, etc.) with no per-folder
//     exclusion list to maintain.
export const config = {
  matcher: ['/((?!_next/static|_next/image|api/|favicon.ico|.*\\..*).*)'],
};
