import type { Metadata } from 'next';

/* dashboard/page.tsx is a client component, which cannot export metadata. This
   server layout exists only to title the tab; the root layout's template
   wraps it as "Dashboard · Arduino888". */
export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Overview of your home: alerts, doors, air quality, and devices.',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
