'use client';

import { useEffect } from 'react';
import { captureUtm } from '@/lib/utm';
import { trackVideoMilestone, type VideoMilestone } from '@/lib/video-tracking';

const HERO_VIMEO_ID = 1236102509;
const HERO_VIMEO_URL = `https://player.vimeo.com/video/${HERO_VIMEO_ID}`;

const REVIEWS = [
  { name: 'Gajanan Pandit', time: '2 weeks ago', text: "I'm vandana pandit, 72, and have suffered chronic knee pain for 12 years. After trying various treatments, sourabh's fm~4 therapy gave me 70% relief in just one session—a true miracle!" },
  { name: 'Ashwin Parate', time: 'a month ago', text: 'Fitness Master offers unique recovery methods. Kulkorni sir identifies pain precisely, and suyash sir is an excellent therapist who relieved my neck spasm in a day. Highly recommend!' },
  { name: 'Nitin Chavare', time: '3 weeks ago', text: "I am Nitin Chavare, 61. After 3 years of severe knee pain and no relief from various treatments, Saurobh sir's FM~4 therapy gave me 55% relief in just 20 minutes. Grateful!" },
  { name: 'Neha Gawde',    time: '1 month ago', text: "I am Neha G., 59, suffering from knee pain due to a gym injury. Saurobh sir's workshop gave me great relief. Thank you, Netbhet and Fitness Master!" },
  { name: 'Sunil Vaidya',  time: '2 months ago', text: 'Workshop was suggested by a friend and changed how I move every day. The personalised assessment is what makes FM4 different.' },
  { name: 'Priya R.',      time: '1 week ago',  text: 'Mother (62) had hip and knee pain. She refused English exercises elsewhere. Hindi sessions made all the difference. Thank you team FM4.' },
];

export const REVIEWS_DATA = REVIEWS;

export default function LandingClient() {
  // Initialize all the client-side bits: counters, sticky CTA, video modal, slider, timeline progress, scarcity, Vimeo unmute.
  useEffect(() => {
    // Capture UTMs on first landing so they survive the Book Now navigation
    // (the checkout-page capture only fires if the visitor arrives there directly).
    try { captureUtm(new URLSearchParams(window.location.search)); } catch { /* noop */ }

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // 1. Animated stat counters
    const fmt = (n: number) => n >= 1000 ? n.toLocaleString('en-IN') : String(n);
    function animateStat(el: HTMLElement) {
      const target = +(el.dataset.count || 0);
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      const dur = 1600;
      const start = performance.now();
      const step = (t: number) => {
        const p = Math.min((t - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.innerHTML = prefix + fmt(Math.floor(target * eased)) + '<sup>' + suffix.trim() + '</sup>';
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    const statIO = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { animateStat(e.target as HTMLElement); statIO.unobserve(e.target); }
      });
    }, { threshold: 0.4 });
    document.querySelectorAll<HTMLElement>('.stat__num').forEach(el => statIO.observe(el));

    // 2. Scroll reveal
    const revealNodes = document.querySelectorAll<HTMLElement>('.reveal');
    if (reduce || !('IntersectionObserver' in window)) {
      revealNodes.forEach(el => el.classList.add('reveal--in'));
    } else {
      const revealIO = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) { e.target.classList.add('reveal--in'); revealIO.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
      revealNodes.forEach(el => revealIO.observe(el));
    }

    // 3. Seat scarcity countdown — now in components/SeatCounter.tsx so the
    //    checkout page can mount it independently.

    // 4. Instructor slider (3 images, autoplay, no pause-on-hover)
    const slides = document.querySelectorAll<HTMLElement>('#instructorSlider .slider__slide');
    let sliderIdx = 0;
    const sliderTimer = slides.length >= 2 ? setInterval(() => {
      slides[sliderIdx].classList.remove('is-active');
      sliderIdx = (sliderIdx + 1) % slides.length;
      slides[sliderIdx].classList.add('is-active');
    }, 3500) : null;

    // 5a. Hero VSL — Vimeo player (official @vimeo/player SDK).
    //
    //   Speed: the player is pre-built *behind* the poster as soon as the page
    //   is idle (or instantly on hover / touch / focus of the video), so by the
    //   time the visitor clicks, the SDK, player and Vimeo connection are
    //   already warm — a click just reveals it and starts playback.
    //
    //   Sound: no `autoplay` param (Vimeo's autoplay falls back to MUTED when a
    //   browser refuses sound). Playback is started from the visitor's click
    //   with volume 1 / unmuted. If a browser (mainly iOS Safari) still refuses
    //   sound from a click outside the iframe, we never fall back to muted —
    //   Vimeo's own play button is visible and one tap plays with sound.
    //
    //   Tracking: Vimeo's own stats stay on (dnt: false); play / 25 / 50 / 75 /
    //   complete also go to GA4, Clarity and Meta via lib/video-tracking.ts.
    const vslContainer = document.getElementById('vslContainer');
    let vslOff: (() => void) | null = null;
    let heroPlayer: { destroy: () => Promise<void> } | null = null;
    let unmounted = false;
    if (vslContainer) {
      type VimeoPlayer = import('@vimeo/player').default;
      let warm: Promise<VimeoPlayer | null> | null = null;
      let started = false;

      // Build the player once, hidden behind the poster (no playback yet).
      const warmUp = () => {
        if (warm) return warm;
        warm = (async () => {
          try {
            const { default: Player } = await import('@vimeo/player');
            if (unmounted) return null;
            vslContainer.classList.add('is-preloaded');
            const player = new Player(vslContainer, {
              id: HERO_VIMEO_ID,
              autoplay: false,
              muted: false,
              playsinline: true,
              dnt: false,
              title: false,
              byline: false,
              portrait: false,
            });
            heroPlayer = player;

            const video = { title: 'FM4 Workshop Preview (Hero VSL)', url: HERO_VIMEO_URL, provider: 'vimeo' };
            const fired = new Set<string>();
            const once = (m: VideoMilestone) => {
              if (fired.has(String(m))) return;
              fired.add(String(m));
              trackVideoMilestone(m, video);
            };
            player.on('play', () => {
              once('start');
              // Belt and braces: never let it run muted.
              player.getMuted().then(m => { if (m) player.setMuted(false).catch(() => {}); }).catch(() => {});
            });
            player.on('timeupdate', ({ percent }: { percent: number }) => {
              for (const m of [25, 50, 75] as const) if (percent * 100 >= m) once(m);
            });
            player.on('ended', () => once('complete'));
            return player;
          } catch (err) {
            console.warn('[hero VSL] Vimeo player failed to load:', err);
            warm = null;
            vslContainer.classList.remove('is-preloaded');
            return null;
          }
        })();
        return warm;
      };

      const reveal = () => {
        vslContainer.querySelectorAll('.hero__vsl-poster-img, .hero__vsl-poster').forEach(n => n.remove());
        vslContainer.classList.remove('is-preloaded', 'is-loading');
      };

      const playHero = async () => {
        if (started) return;
        started = true;
        vslContainer.classList.add('is-loading');
        const player = await warmUp();
        if (unmounted) return;
        if (!player) { started = false; vslContainer.classList.remove('is-loading'); return; }
        // Wait briefly for Vimeo to be ready (usually already is, thanks to
        // warm-up); never longer than 4s so nobody is stuck on the poster.
        const ready = await Promise.race([
          player.ready().then(() => true).catch(() => false),
          new Promise<boolean>(res => setTimeout(() => res(false), 4000)),
        ]);
        if (unmounted) return;
        reveal();
        if (!ready) return; // Vimeo's own play button is visible — one tap plays with sound.
        try {
          await player.setVolume(1);
          await player.setMuted(false);
          await player.play();
        } catch {
          // Browser refused sound from an outside click (iOS Safari). Leave it
          // paused and unmuted — Vimeo's play button starts it with sound.
        }
      };

      const onKey = (e: Event) => {
        const k = (e as KeyboardEvent).key;
        if (k === 'Enter' || k === ' ') { e.preventDefault(); void playHero(); }
      };
      const onIntent = () => { void warmUp(); };

      // Warm up early: on any sign of intent, or once the page is idle.
      vslContainer.addEventListener('pointerenter', onIntent, { once: true });
      vslContainer.addEventListener('touchstart', onIntent, { once: true, passive: true });
      vslContainer.addEventListener('focusin', onIntent, { once: true });
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      const idleWarm = () => { if (ric) ric(onIntent, { timeout: 2500 }); else setTimeout(onIntent, 1500); };
      if (document.readyState === 'complete') idleWarm();
      else window.addEventListener('load', idleWarm, { once: true });

      vslContainer.addEventListener('click', playHero);
      vslContainer.addEventListener('keydown', onKey);
      vslOff = () => {
        vslContainer.removeEventListener('click', playHero);
        vslContainer.removeEventListener('keydown', onKey);
        vslContainer.removeEventListener('pointerenter', onIntent);
        vslContainer.removeEventListener('touchstart', onIntent);
        vslContainer.removeEventListener('focusin', onIntent);
        window.removeEventListener('load', idleWarm);
      };
    }

    // 5. Video modal (Vimeo iframe injection)
    const modal  = document.getElementById('videoModal');
    const player = document.getElementById('videoModalPlayer');
    const close  = document.getElementById('videoModalClose');
    const openModal = (url: string) => {
      if (!modal || !player) return;
      const isVideoFile = /\.mp4/i.test(url);
      player.innerHTML = isVideoFile
        ? `<video src="${url}" controls autoplay playsinline></video>`
        : `<iframe src="${url}${url.includes('?') ? '&' : '?'}autoplay=1&playsinline=1" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" allowfullscreen></iframe>`;
      modal.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    };
    const dismissModal = () => {
      if (!modal || !player) return;
      modal.classList.remove('is-open');
      player.innerHTML = '';
      document.body.style.overflow = '';
    };
    const tileHandlers: Array<() => void> = [];
    document.querySelectorAll<HTMLButtonElement>('.video-tile[data-video-url]').forEach(tile => {
      const handler = () => openModal(tile.getAttribute('data-video-url') || '');
      tile.addEventListener('click', handler);
      tileHandlers.push(() => tile.removeEventListener('click', handler));
    });
    if (close) close.addEventListener('click', dismissModal);
    const modalBgHandler = (e: MouseEvent) => { if (e.target === modal) dismissModal(); };
    if (modal) modal.addEventListener('click', modalBgHandler);
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modal?.classList.contains('is-open')) dismissModal();
    };
    document.addEventListener('keydown', keyHandler);

    // 6. Timeline scroll-progress bar
    const tlWrap = document.getElementById('curriculumTimeline');
    const tlBar  = document.getElementById('timelineProgress');
    const tlUpdate = () => {
      if (!tlWrap || !tlBar) return;
      const rect = tlWrap.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const start = vh * 0.55 - rect.top;
      const span = rect.height;
      const pct = Math.max(0, Math.min(1, start / span));
      tlBar.style.height = (pct * 100).toFixed(2) + '%';
    };
    tlUpdate();
    window.addEventListener('scroll', tlUpdate, { passive: true });
    window.addEventListener('resize', tlUpdate, { passive: true });

    // 7. Unmute toggle for the instructor section (CDN <video>)
    const instructorVideo = document.getElementById('instructorVideo') as HTMLVideoElement | null;
    const soundBtn = document.getElementById('videoSoundBtn');
    let muted = true;
    if (instructorVideo) { instructorVideo.muted = true; instructorVideo.play?.().catch(() => { /* autoplay blocked */ }); }
    const paintSound = () => {
      if (!soundBtn) return;
      soundBtn.setAttribute('aria-pressed', String(!muted));
      soundBtn.classList.toggle('is-unmuted', !muted);
      const icon = soundBtn.querySelector('.video-block__sound-icon');
      const lab  = soundBtn.querySelector('.video-block__sound-label');
      if (icon) icon.textContent = muted ? '🔇' : '🔊';
      if (lab)  lab.textContent  = muted ? 'Unmute' : 'Mute';
    };
    const soundClick = () => {
      if (!instructorVideo) return;
      muted = !muted;
      paintSound();
      instructorVideo.muted = muted;
      if (!muted) instructorVideo.play?.().catch(() => { /* noop */ });
    };
    if (soundBtn) soundBtn.addEventListener('click', soundClick);

    // 8. Sticky bottom CTA visibility
    const stickyCta = document.getElementById('stickyCta');
    const stickyToggle = () => {
      if (!stickyCta) return;
      if (window.scrollY > 360) stickyCta.classList.add('is-visible');
      else stickyCta.classList.remove('is-visible');
    };
    const stickySync = () => {
      if (!stickyCta) return;
      document.body.style.paddingBottom = stickyCta.offsetHeight + 'px';
    };
    requestAnimationFrame(() => { stickySync(); stickyToggle(); });
    window.addEventListener('scroll', stickyToggle, { passive: true });
    window.addEventListener('resize', stickySync, { passive: true });

    // Cleanup
    return () => {
      if (sliderTimer) clearInterval(sliderTimer);
      window.removeEventListener('scroll', tlUpdate);
      window.removeEventListener('resize', tlUpdate);
      window.removeEventListener('scroll', stickyToggle);
      window.removeEventListener('resize', stickySync);
      document.removeEventListener('keydown', keyHandler);
      if (modal) modal.removeEventListener('click', modalBgHandler);
      if (close) close.removeEventListener('click', dismissModal);
      if (soundBtn) soundBtn.removeEventListener('click', soundClick);
      tileHandlers.forEach(off => off());
      if (vslOff) vslOff();
      unmounted = true;
      heroPlayer?.destroy().catch(() => {});
    };
  }, []);

  return null;
}
