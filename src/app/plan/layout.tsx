import type { Metadata } from 'next';

/* plan/page.tsx is a client component, which cannot export metadata. This
   server layout exists only to title the tab; the root layout's template
   wraps it as "Floor plan · Arduino888". */
export const metadata: Metadata = {
  title: 'Floor plan',
  description: 'Devices shown where they physically are.',
};

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
