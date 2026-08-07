import type { Metadata } from 'next';

/* devices/page.tsx is a client component, which cannot export metadata. This
   server layout exists only to title the tab; the root layout's template
   wraps it as "Devices · Arduino888". */
export const metadata: Metadata = {
  title: 'Devices',
  description: 'The doorbell and the hub, and how each is reporting.',
};

export default function DevicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
