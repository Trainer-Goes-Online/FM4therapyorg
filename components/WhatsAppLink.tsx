'use client';

import type { ReactNode } from 'react';
import { brand } from '@/lib/config';
import { trackGa4EventOnce } from '@/lib/ga4';

// External anchor to the FM4 WhatsApp community. Both instances on
// /thank-you (primary CTA + sticky bottom) share this wrapper so the
// GA4 join_whatsapp event fires exactly once per browser, regardless of
// which button the visitor clicks first.
//
// target="_blank" opens the WhatsApp link in a new tab — the current
// /thank-you tab stays alive, so a synchronous gtag() call in onClick
// fires cleanly. No sendBeacon or unload race to worry about.
export default function WhatsAppLink({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={brand.whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => trackGa4EventOnce('join_whatsapp')}
    >
      {children}
    </a>
  );
}
