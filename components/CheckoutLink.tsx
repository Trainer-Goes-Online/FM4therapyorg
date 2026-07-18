'use client';

import { useState, useEffect, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { trackGa4EventOnce } from '@/lib/ga4';

// Anchor that forwards every query param on the current landing URL to the
// checkout page. Mounts client-side, reads window.location.search, and appends
// it to /product-checkout. With no params it renders a plain /product-checkout
// link — identical to the previous <a href="/product-checkout"> behavior.
//
// Also fires an AddToCart CAPI event (via server route + navigator.sendBeacon)
// the FIRST time the visitor clicks any CTA in their browser lifetime. A
// localStorage flag prevents re-fires forever per browser. The beacon is
// fire-and-forget — it never blocks navigation.

const ATC_FLAG_KEY = 'fm4_atc_fired';

function fireAddToCartBeacon() {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(ATC_FLAG_KEY)) return;
    // Set the flag OPTIMISTICALLY, before the beacon leaves. Even if the
    // tab is killed mid-navigation and the beacon fails to reach the
    // server, no future click will refire — one AddToCart per browser,
    // ever, is the intended contract.
    localStorage.setItem(ATC_FLAG_KEY, '1');

    const body = JSON.stringify({ eventSourceUrl: window.location.href });
    const url = '/api/meta/add-to-cart';

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // Blob with explicit MIME type — CORS-safe simple request, guaranteed
      // to send during pagehide/unload per the Beacon API spec.
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    } else {
      // Fallback for browsers without sendBeacon (rare in 2026).
      // keepalive lets fetch survive page navigation up to 64KB.
      void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => { /* fire-and-forget */ });
    }
  } catch {
    // Any storage / API error → silently no-op. Never break the click.
  }
}

export default function CheckoutLink({
  children,
  className,
  onClick,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>) {
  const [qs, setQs] = useState('');

  useEffect(() => {
    setQs(window.location.search);
  }, []);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Fire both trackers on the same click. Their dedup surfaces are
    // independent: fireAddToCartBeacon uses localStorage.fm4_atc_fired
    // (server-side CAPI event), trackGa4EventOnce uses fm4_ga4_add_to_cart_fired.
    // A Meta outage does not suppress GA4 and vice versa.
    fireAddToCartBeacon();
    trackGa4EventOnce('add_to_cart');
    if (onClick) onClick(e);
  }

  return (
    <a
      href={`/product-checkout${qs}`}
      className={className}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </a>
  );
}
