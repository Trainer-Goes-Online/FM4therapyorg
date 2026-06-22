'use client';

import { useEffect, useState, type FormEvent } from 'react';

// =====================================================================
// Webinar Bonus page — password-gated grid of downloadable bonus PDFs.
//
// The gate is intentionally client-side only: the PDFs live in /public
// and are publicly reachable by direct URL regardless, so this is a
// light "don't share the link" cover, not real access control. Once
// unlocked, the state is remembered in sessionStorage so a reload (or
// navigating back to the page in the same tab) doesn't re-prompt.
// =====================================================================

const BONUS_PASSWORD = '225781';
const UNLOCK_KEY = 'fm4_bonus_unlocked';

// PDFs live in `public/Bonus PDF/` → the space encodes to %20 in the URL.
const PDF_DIR = '/Bonus%20PDF';

type Bonus = {
  n: number;
  /** Accent colour for the big number — matches the reference design. */
  accent: string;
  title: string;
  file: string;
};

const BONUSES: Bonus[] = [
  {
    n: 1,
    accent: '#FF2BA6',
    title: 'Comprehensive Guide to Spine Care Keeping Backbone Strong',
    file: 'Comprehensive-Guide-to-Spine-Care-Keeping-Your-Backbone-Strong-and-Healthy-1-1.pdf',
  },
  {
    n: 2,
    accent: '#9B4DFF',
    title: 'Comprehensive Guide to Knee Care Exercise',
    file: 'Comprehensive-Guide-to-Knee-Care-Exercises-and-Tips-for-a-Healthy-Joint-1.pdf',
  },
  {
    n: 3,
    accent: '#FF7A18',
    title: 'Lifting Techniques & Preventing Back Strain',
    file: 'Lifting-Techniques-and-Preventing-Back-Strain-1-1.pdf',
  },
  {
    n: 4,
    accent: '#FFFFFF',
    title: 'Back to Basics a Guide to Spine Care',
    file: 'Back-to-Basics-A-Guide-to-Spine-Care.pdf',
  },
  {
    n: 5,
    accent: '#19C964',
    title: 'Lifestyle Tips for Knee Care',
    file: 'Lifestyle-Tips-for-Knee-Care-1.pdf',
  },
];

export default function WebinarBonus() {
  const [unlocked, setUnlocked] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  // Avoid a flash of the gate before sessionStorage is read on the client.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(UNLOCK_KEY) === '1') setUnlocked(true);
    } catch {
      /* sessionStorage unavailable (private mode) — just show the gate */
    }
    setReady(true);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim() === BONUS_PASSWORD) {
      setUnlocked(true);
      setError(false);
      try {
        sessionStorage.setItem(UNLOCK_KEY, '1');
      } catch {
        /* ignore */
      }
    } else {
      setError(true);
    }
  };

  return (
    <main className="wbonus">
      {!ready ? null : !unlocked ? (
        <section className="wbonus__gate">
          <form className="wbonus-lock" onSubmit={submit}>
            <div className="wbonus-lock__icon" aria-hidden="true">🔒</div>
            <h1 className="wbonus-lock__title">Protected Bonuses</h1>
            <p className="wbonus-lock__sub">
              Enter the password from your workshop to unlock your FM4 Live Summit bonuses.
            </p>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              className={`wbonus-lock__input${error ? ' wbonus-lock__input--error' : ''}`}
              placeholder="Enter password"
              aria-label="Password"
              aria-invalid={error}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(false);
              }}
              autoFocus
            />
            {error ? (
              <p className="wbonus-lock__error" role="alert">
                Incorrect password. Please try again.
              </p>
            ) : null}
            <button type="submit" className="btn btn--cta btn--block">
              Unlock Bonuses
            </button>
          </form>
        </section>
      ) : (
        <section className="wbonus__content">
          <div className="container">
            <header className="wbonus__head">
              <h1 className="wbonus__title">FM4 LIVE SUMMIT BONUSES:</h1>
              <p className="wbonus__eyebrow">Exclusive!</p>
            </header>

            <div className="wbonus__grid">
              {BONUSES.map((b) => (
                <article className="wbonus-card" key={b.n}>
                  <div className="wbonus-card__label">BONUS</div>
                  <div
                    className="wbonus-card__num"
                    style={{ color: b.accent }}
                  >
                    {b.n}
                  </div>
                  <p className="wbonus-card__desc">{b.title}</p>
                  <a
                    className="btn btn--cta btn--block wbonus-card__btn"
                    href={`${PDF_DIR}/${b.file}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    CLICK NOW
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
