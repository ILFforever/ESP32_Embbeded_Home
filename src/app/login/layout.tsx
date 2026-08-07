import type { Metadata } from 'next';

/* login/page.tsx is a client component, which cannot export metadata. This
   server layout exists only to title the tab; the root layout's template
   wraps it as "Sign in · Arduino888". */
export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Arduino888 home.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
