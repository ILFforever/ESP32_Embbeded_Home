import type { Metadata } from 'next';
import { AuthProvider } from '@/context/AuthContext';
import GlassRuntime from '@/components/glass/GlassRuntime';
import './globals.css';

/* Every page used to inherit this one title, so eight open tabs all read
   "Arduino888 Smart Home" and you had to click through them to find the one
   you wanted. Each section now sets its own `title` and this template frames
   it — "Doorbell · Arduino888". The brand goes last because a tab strip
   truncates from the right, so the distinguishing word survives.

   `default` is for routes that set no title of their own: the redirect at /
   and the 404. Pages are client components and cannot export metadata, so the
   section titles live in a small server layout beside each one. */
export const metadata: Metadata = {
  title: {
    default: 'Arduino888 Smart Home',
    template: '%s · Arduino888',
  },
  description: 'Smart Home Control System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var q=new URLSearchParams(location.search).get('theme');var t=(q==='dark'||q==='light')?q:localStorage.getItem('arduino888-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}`,
          }}
        />
      </head>
      <body>
        <div className="g-bg" aria-hidden="true" />
        <AuthProvider>{children}</AuthProvider>
        <GlassRuntime />
      </body>
    </html>
  );
}
