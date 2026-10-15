'use client';

// Hero VSL (Vimeo) engagement tracking — fans each milestone out to GA4,
// Microsoft Clarity and the Meta Pixel. Every call is a no-op when that
// tool isn't loaded (layout.tsx skips all three in ₹1 test mode, or when
// its ID env var is missing), and errors are swallowed so analytics can
// never break playback.
//
// GA4 uses Google's recommended video event names (video_start,
// video_progress, video_complete) so they line up with GA4's built-in
// video reports. Meta gets custom events usable for "watched X%" audiences.

export type VideoMilestone = 'start' | 25 | 50 | 75 | 'complete';

type Fn = (...args: unknown[]) => void;

function fn(name: 'gtag' | 'clarity' | 'fbq'): Fn | undefined {
  if (typeof window === 'undefined') return undefined;
  const f = (window as unknown as Record<string, unknown>)[name];
  return typeof f === 'function' ? (f as Fn) : undefined;
}

export function trackVideoMilestone(
  milestone: VideoMilestone,
  video: { title: string; url: string; provider: string },
): void {
  const percent = milestone === 'start' ? 0 : milestone === 'complete' ? 100 : milestone;
  const ga4Event =
    milestone === 'start' ? 'video_start' : milestone === 'complete' ? 'video_complete' : 'video_progress';
  const label = milestone === 'start' ? 'play' : milestone === 'complete' ? 'complete' : `${milestone}`;

  try {
    fn('gtag')?.('event', ga4Event, {
      video_title: video.title,
      video_url: video.url,
      video_provider: video.provider,
      video_percent: percent,
    });
  } catch { /* swallow */ }

  try {
    fn('clarity')?.('event', `vsl_${label}`);
  } catch { /* swallow */ }

  try {
    fn('fbq')?.('trackCustom', milestone === 'start' ? 'VSLPlay' : milestone === 'complete' ? 'VSLComplete' : `VSLWatched${milestone}`, {
      video_title: video.title,
      percent,
    });
  } catch { /* swallow */ }
}
