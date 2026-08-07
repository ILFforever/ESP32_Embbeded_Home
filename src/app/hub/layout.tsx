import type { Metadata } from 'next';

/* hub/page.tsx is a client component, which cannot export metadata. This
   server layout exists only to title the tab; the root layout's template
   wraps it as "Hub · Arduino888". */
export const metadata: Metadata = {
  title: 'Hub',
  description: 'Hub display, sensors, and the amplifier.',
};

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return children;
}
