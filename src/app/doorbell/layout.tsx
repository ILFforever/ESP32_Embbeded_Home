import type { Metadata } from 'next';

/* doorbell/page.tsx is a client component, which cannot export metadata. This
   server layout exists only to title the tab; the root layout's template
   wraps it as "Doorbell · Arduino888". */
export const metadata: Metadata = {
  title: 'Doorbell',
  description: 'Front door camera, visitors, and audio.',
};

export default function DoorbellLayout({ children }: { children: React.ReactNode }) {
  return children;
}
