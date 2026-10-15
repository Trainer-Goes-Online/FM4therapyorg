import { preconnect, prefetchDNS } from 'react-dom';

// Server component: emits <link rel="preconnect"> hints for Vimeo into the
// initial HTML <head> of the landing pages, so the hero player (pre-built by
// LandingClient) and its first video segments start without DNS/TLS delay.
export default function VimeoPreconnect() {
  preconnect('https://player.vimeo.com');
  preconnect('https://f.vimeocdn.com');
  preconnect('https://vod-adaptive-ak.vimeocdn.com');
  prefetchDNS('https://i.vimeocdn.com');
  prefetchDNS('https://fresnel.vimeocdn.com');
  return null;
}
