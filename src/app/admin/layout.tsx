import type { Metadata } from 'next';

/* admin/page.tsx is a client component, which cannot export metadata. This
   server layout exists only to title the tab; the root layout's template
   wraps it as "Admin · Arduino888". */
export const metadata: Metadata = {
  title: 'Admin',
  description: 'People, accounts, and enrolled boards.',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
