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

  // Show loading state while checking authentication
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      fontSize: '18px',
      color: '#666'
    }}>
      Loading...
    </div>
  );
}