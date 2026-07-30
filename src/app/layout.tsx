import type { Metadata } from 'next';
import { AuthProvider } from '@/context/AuthContext';
import GlassRuntime from '@/components/glass/GlassRuntime';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arduino888 Smart Home',
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
