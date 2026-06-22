import type { Metadata } from 'next';
import WebinarBonus from '@/components/WebinarBonus';

export const metadata: Metadata = {
  title: 'FM4 Live Summit Bonuses',
  description: 'Exclusive downloadable bonuses for FM4 Pain-Free Workshop attendees.',
  robots: { index: false, follow: false },
};

export default function WebinarBonusPage() {
  return <WebinarBonus />;
}
