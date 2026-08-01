'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/info`);
        const data = await response.json();
        console.log('Server status:', data);
      } catch (error) {
        console.error('Error checking server status:', error);
      }
    };

    checkServerStatus();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      // If user is authenticated, go to dashboard
      // Otherwise, go to login
      if (isAuthenticated) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  /* Only on screen for a moment, but it was using .loading-page /
     .loading-spinner — classes deleted with the old stylesheet — so it
     rendered completely unstyled. */
  return (
    <div className="g-waiting">
      <div className="g-waiting__inner">
        <div className="g-spinner" aria-hidden="true" />
        <h1>Arduino888 Smart Home</h1>
        <p aria-live="polite">Checking whether you are signed in.</p>
      </div>
    </div>
  );
}