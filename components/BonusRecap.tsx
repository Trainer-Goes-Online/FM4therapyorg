import type { ReactNode } from 'react';
import { BONUSES, BONUS_UI, inr, offer, type Lang } from '@/lib/bonuses';
import { pricing } from '@/lib/config';

// "Recap of everything you'll get" — sits just above the footer. Rows,
// values and totals all come from lib/bonuses.ts (BONUSES + offer), so it
// can never disagree with the bonus cards.
export default function BonusRecap({ cta, lang = 'en' }: { cta?: ReactNode; lang?: Lang }) {
  const t = BONUS_UI[lang];
  const rows = [
    { key: 'workshop', title: t.workshopRow, value: offer.workshopValue },
    ...BONUSES.map(b => ({ key: `bonus-${b.n}`, title: `${t.bonusLabel(b.n)}: ${b.title[lang]}`, value: b.value })),
  ];

  return (
    <section className={`section section--cream recap${lang === 'en' ? '' : ' is-deva'}`}>
      <div className="container">
        <div className="recap-card reveal">
          <div className="recap-card__badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <h2 className="recap-card__title">{t.recapTitle} <span className="green">{t.recapTitleGreen}</span></h2>

          <table className="recap-table">
            <thead>
              <tr>
                <th scope="col">{t.thIncluded}</th>
                <th scope="col">{t.thValue}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key}>
                  <td>
                    <span className="recap-table__item">
                      <span className="recap-table__tick" aria-hidden="true">✓</span>
                      {r.title}
                    </span>
                  </td>
                  <td>₹{inr(r.value)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t.totalValue}</th>
                <td><s>₹{inr(offer.totalValue)}</s></td>
              </tr>
            </tfoot>
          </table>

          <div className="recap-price">
            <span className="recap-price__label">{t.getEverything}</span>
            <s className="recap-price__old">₹{inr(pricing.client.originalInr)}</s>
            <span className="recap-price__new">₹{inr(offer.price)}</span>
            <span className="recap-price__save">{t.save(inr(offer.savings), offer.percentOff)}</span>
            <span className="recap-price__note">{t.oneTime}</span>
          </div>

          {cta && <div className="cta-block">{cta}</div>}
        </div>
      </div>
    </section>
  );
}
