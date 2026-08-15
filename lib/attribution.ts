// =====================================================================
// Attribution — pure, Edge-safe (no node:crypto, no DOM, no next/server).
//
// The module the middleware, create-order route, and webhook all share.
// Runs unmodified on the Edge Runtime, the Node runtime, and unit tests.
//
// Design pulled from the FUNNEL_ATTRIBUTION_AUDIT playbook. Fixes:
//   L1  edge capture (via middleware calling parseAttributionFromUrl + mergeAttribution)
//   L3  utm_* reconstruction from referrer when the cookie / body are empty
//   L4  fbclid + click-ts derivation from the _fbc cookie
//         (fb.1.<subdomainIndex>.<clickTsMs>.<fbclid>)
//   L5  packJsonNote — the JSON-safe replacement for truncate(JSON.stringify(...))
//         which silently sliced mid-JSON and lost every field at once
// =====================================================================

export const ATTR_COOKIE = 'fm4_attr';
export const ATTR_TTL_SECONDS = 30 * 24 * 60 * 60;

export const URL_TO_KEY: Record<string, string> = {
  utm_source:   'source',
  utm_medium:   'medium',
  utm_campaign: 'campaign',
  utm_content:  'content',
  utm_term:     'term',
  fbclid:       'fbclid',
  gclid:        'gclid',
};

export const UTM_KEYS = ['source', 'medium', 'campaign', 'content', 'term'] as const;
export type UtmKey = typeof UTM_KEYS[number];

export interface AttributionRecord {
  source?:       string;
  medium?:       string;
  campaign?:     string;
  content?:      string;
  term?:         string;
  fbclid?:       string;
  gclid?:        string;
  ts?:           number;
  landing_url?:  string;
  referrer?:     string;
}

export interface ResolvedAttribution {
  utm:         Record<UtmKey, string>;
  fbclid:      string;
  fbclidTs:    number;
  gclid:       string;
  referrer:    string;
  landingUrl:  string;
  provenance:  string;
  utmSource:   'cookie' | 'body' | 'referrer' | 'none';
  clidSource:  'cookie' | 'body' | 'fbc' | 'none';
}

const isFilled = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0;

// -----------------------------------------------------------
// Parsers
// -----------------------------------------------------------

// Extract utm_*/fbclid/gclid from a URL or query string. Accepts a full
// URL, a bare query string, or an already-`?`-prefixed search fragment.
export function parseAttributionFromUrl(input: string | null | undefined): AttributionRecord {
  const out: AttributionRecord = {};
  if (!input) return out;
  try {
    const search = input.includes('?') ? input.slice(input.indexOf('?')) : input;
    const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    for (const [param, key] of Object.entries(URL_TO_KEY)) {
      const v = sp.get(param);
      if (isFilled(v)) (out as Record<string, string>)[key] = v;
    }
  } catch { /* malformed URL — return empty */ }
  return out;
}

// The _fbc cookie is `fb.<subdomainIndex>.<clickTsMs>.<fbclid>` — the ONLY
// complete server-side source for fbclid + click timestamp. The referrer
// truncates fbclid at Razorpay's 256-char cap; parsing _fbc avoids that.
export function parseFbc(fbc: string | null | undefined): { fbclid?: string; ts?: number } {
  if (!isFilled(fbc)) return {};
  const p = fbc.split('.');
  if (p.length < 4 || p[0] !== 'fb') return {};
  const ts = Number(p[2]);
  return {
    fbclid: p.slice(3).join('.'),
    ts:     Number.isFinite(ts) && ts > 0 ? ts : undefined,
  };
}

// Decode a cookie value (URI-encoded JSON). Returns {} on any parse fault
// so a corrupt cookie never crashes the middleware or a request handler.
export function readAttrCookie(raw: string | null | undefined): AttributionRecord {
  if (!isFilled(raw)) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as AttributionRecord)
      : {};
  } catch {
    return {};
  }
}

// -----------------------------------------------------------
// L1 merge — last-touch UTM, first-touch context
// -----------------------------------------------------------

// Attribution keys (source/medium/campaign/content/term/fbclid/gclid/ts) are
// LAST-touch: a new tagged URL overwrites the stored one.
// Context keys (landing_url/referrer) are FIRST-touch: stamped only when
// the stored record has no landing_url yet.
export function mergeAttribution(
  stored: AttributionRecord,
  opts: { live: AttributionRecord; landingUrl: string; referrer: string; now: number },
): { attr: AttributionRecord; changed: boolean } {
  const attr: AttributionRecord = { ...stored };
  let changed = false;

  if (!isFilled(attr.landing_url) && isFilled(opts.landingUrl)) {
    attr.landing_url = opts.landingUrl;
    attr.referrer = isFilled(opts.referrer) ? opts.referrer : '';
    changed = true;
  }

  if (opts.live && Object.keys(opts.live).length > 0) {
    Object.assign(attr, opts.live, { ts: opts.now });
    changed = true;
  }

  return { attr, changed };
}

// -----------------------------------------------------------
// L2 + L3 + L4 — resolve final values with precedence
// -----------------------------------------------------------

// Precedence per field:
//   utm_*   : cookie → body → referrer → none
//   fbclid  : cookie → body → parsed from _fbc → none  (never referrer)
//   gclid   : cookie → body → none
// referrer is deliberately SKIPPED as a fbclid source: Razorpay's 256-char
// value cap truncates the referrer, which chops the fbclid in half (real
// observation: 49 of 195 chars). Only _fbc preserves the full click id.
export function resolveAttribution(input: {
  cookieAttr?: AttributionRecord;
  bodyAttr?:   AttributionRecord;
  referrer?:   string;
  landingUrl?: string;
  fbc?:        string;
  now?:        number;
} = {}): ResolvedAttribution {
  const cookieAttr = input.cookieAttr ?? {};
  const bodyAttr   = input.bodyAttr   ?? {};
  const referrer   = input.referrer   ?? '';
  const landingUrl = input.landingUrl ?? '';
  const fbc        = input.fbc        ?? '';
  const now        = input.now        ?? Date.now();

  // --- UTMs: cookie → body → referrer ---
  const utm: Record<UtmKey, string> = { source: '', medium: '', campaign: '', content: '', term: '' };
  let utmSource: ResolvedAttribution['utmSource'] = 'none';

  for (const [label, src] of ([['cookie', cookieAttr], ['body', bodyAttr]] as const)) {
    for (const key of UTM_KEYS) {
      const val = (src as Record<string, string>)?.[key];
      if (!isFilled(utm[key]) && isFilled(val)) {
        utm[key] = val;
        if (utmSource === 'none') utmSource = label;
      }
    }
  }

  if (UTM_KEYS.every((k) => !isFilled(utm[k]))) {
    const recovered = {
      ...parseAttributionFromUrl(landingUrl),
      ...parseAttributionFromUrl(referrer),
    };
    let used = false;
    for (const key of UTM_KEYS) {
      const v = (recovered as Record<string, string>)[key];
      if (isFilled(v)) { utm[key] = v; used = true; }
    }
    if (used) utmSource = 'referrer';
  }

  // --- fbclid + click ts: cookie → body → _fbc (never referrer for the id) ---
  let fbclid    = '';
  let fbclidTs  = 0;
  let clidSource: ResolvedAttribution['clidSource'] = 'none';

  if (isFilled(cookieAttr.fbclid)) {
    fbclid = cookieAttr.fbclid;
    clidSource = 'cookie';
    fbclidTs = Number(cookieAttr.ts) || 0;
  } else if (isFilled(bodyAttr.fbclid)) {
    fbclid = bodyAttr.fbclid;
    clidSource = 'body';
    fbclidTs = Number(bodyAttr.ts) || 0;
  } else {
    const f = parseFbc(fbc);
    if (isFilled(f.fbclid)) {
      fbclid = f.fbclid;
      clidSource = 'fbc';
      fbclidTs = f.ts || 0;
    }
  }

  if (!fbclidTs) {
    fbclidTs = Number(cookieAttr.ts) || Number(bodyAttr.ts) || 0;
  }

  // --- gclid ---
  const gclid = [cookieAttr.gclid, bodyAttr.gclid].find(isFilled) || '';

  // --- provenance context ---
  const resolvedReferrer =
    [referrer, cookieAttr.referrer, bodyAttr.referrer].find(isFilled) || '';
  const resolvedLandingUrl =
    [landingUrl, cookieAttr.landing_url, bodyAttr.landing_url].find(isFilled) || '';

  return {
    utm,
    fbclid,
    fbclidTs: fbclidTs || now,
    gclid,
    referrer: resolvedReferrer,
    landingUrl: resolvedLandingUrl,
    provenance: `utm:${utmSource}|clid:${clidSource}`,
    utmSource,
    clidSource,
  };
}

// -----------------------------------------------------------
// L5 — JSON-safe note packing
// -----------------------------------------------------------

// Replacement for the classic bug `truncate(JSON.stringify(obj), 256)`,
// which silently slices mid-JSON on long campaign names and destroys every
// field at once (JSON.parse throws → defensive catch returns {} → all fields lost).
//
// This function guarantees valid JSON under `max` chars by iteratively
// shortening the LONGEST value. If even the shortest possible representation
// exceeds `max` (extreme edge), returns `{}` — the exact caller-visible
// signal that the pack failed, so at least it's not silently corrupted.
export function packJsonNote(obj: Record<string, unknown>, max = 256): string {
  const w: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    w[k] = typeof v === 'string' ? v : String(v ?? '');
  }

  let json = JSON.stringify(w);
  let guard = 0;

  while (json.length > max && guard < 200) {
    guard += 1;

    // Find the current longest value.
    let victimKey: string | null = null;
    let victimLen = 0;
    for (const [k, v] of Object.entries(w)) {
      if (v.length > victimLen) { victimLen = v.length; victimKey = k; }
    }
    if (!victimKey || victimLen === 0) break;

    // Shrink it just enough to bring the whole blob under `max`.
    const cut = Math.max(1, Math.min(victimLen, json.length - max));
    w[victimKey] = w[victimKey].slice(0, victimLen - cut);
    json = JSON.stringify(w);
  }

  return json.length > max ? '{}' : json;
}
