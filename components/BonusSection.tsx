import type { ReactNode } from 'react';
import { pricing } from '@/lib/config';
import { BONUSES, BONUS_UI, bonusesTotalInr, inr, offer, type Lang } from '@/lib/bonuses';

// Landing-page bonuses section: five equal cards, three on the first row
// and the last two centred below (1 2 3 / 4 5). Bonus copy and values live
// in lib/bonuses.ts; cover art in public/Images Sourabh/bonus-<n>.webp.

const svg = (paths: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
);

// Icon per bonus number.
const ICONS: Record<number, ReactNode> = {
  1: svg(<path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12" />),
  2: svg(<path d="M3 12h4l3-8 4 16 3-8h4" />),
  3: svg(<><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>),
  4: svg(<><path d="M7 3v9h10V3" /><path d="M5 12h14v3H5z" /><path d="M7 15v6M17 15v6" /></>),
  5: svg(<><circle cx="13" cy="4" r="2" /><path d="M10 21l2-6 3 3v3" /><path d="M8 12l3-4 3 2 3 3" /></>),
};

const pad = (n: number) => String(n).padStart(2, '0');

function Included({ label }: { label: string }) {
  return (
    <span className="bonus-access">
      <span aria-hidden="true">🎁</span> {label}
      <span className="bonus-access__tick" aria-hidden="true">✓</span>
    </span>
  );
}

function Cover({ n, title }: { n: number; title: string }) {
  return (
    <div className="bonus-cover">
      <img src={`/Images%20Sourabh/bonus-${n}.webp`} alt={`Bonus ${n}: ${title} — guide cover`} loading="lazy" width={800} height={800} />
    </div>
  );
}

export default function BonusSection({ cta, lang = 'en' }: { cta?: ReactNode; lang?: Lang }) {
  const t = BONUS_UI[lang];
  return (
    <section className={`section bonuses${lang === 'en' ? '' : ' is-deva'}`}>
      <div className="container">
        <div className="section-head reveal">
          <span className="bonus-kicker">{t.kicker}</span>
          <h2>{t.heading} <span className="green" style={{ whiteSpace: 'nowrap' }}>{t.headingGreen}</span></h2>
        </div>

        <div className="bonus-grid">
          {BONUSES.map((b, i) => (
            <article key={b.n} className={`bonus-card reveal${i % 3 ? ` reveal-delay-${i % 3}` : ''}`}>
              <Cover n={b.n} title={b.title.en} />
              <div className="bonus-card__body">
                <div className="bonus-card__top">
                  <span className="bonus-card__icon" aria-hidden="true">{ICONS[b.n]}</span>
                  <span className="bonus-card__num">{pad(b.n)}</span>
                  <span className="bonus-card__value bonus-card__value--right">{t.value(inr(b.value))}</span>
                </div>
                <h3 className="bonus-card__title">{b.title[lang]}</h3>
                <p className="bonus-card__copy">{b.copy[lang]}</p>
                <Included label={t.included} />
              </div>
            </article>
          ))}
        </div>

        {/* ── Value summary ── */}
        <div className="offer-summary reveal">
          <div className="offer-total">
            <span className="offer-total__label">{t.totalBonusValue}</span>
            <span className="offer-total__value">₹{inr(bonusesTotalInr)}</span>
          </div>
          <p className="offer-everything">{t.getEverything}</p>
          <div className="offer-price">
            <s className="offer-price__old">₹{inr(pricing.client.originalInr)}</s>
            <span className="offer-price__new">₹{inr(offer.price)}</span>
          </div>
          <p className="offer-save">{t.save(inr(offer.savings), offer.percentOff)}</p>
        </div>

        {cta && <div className="cta-block reveal">{cta}</div>}
      </div>
    </section>
  );
}
