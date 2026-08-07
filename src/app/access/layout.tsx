import type { Metadata } from 'next';

/* access/page.tsx is a client component, which cannot export metadata. This
   server layout exists only to title the tab; the root layout's template
   wraps it as "Access · Arduino888". */
export const metadata: Metadata = {
  title: 'Access',
  description: 'Door locks, battery state, and NFC card enrolment.',
};

export default function AccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
