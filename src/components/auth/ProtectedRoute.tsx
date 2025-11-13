import React, {useEffect} from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAdmin = false,
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '18px',
        color: '#666'
      }}>
        Loading...
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    const router = useRouter();
    useEffect(() => { router.push('/login'); }, [router]);
    return null; 
  }


  // Check admin access if required
  if (requireAdmin && user?.role !== 'admin') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        gap: '20px'
      }}>
        <h2 style={{ color: '#c33', margin: 0 }}>Access Denied</h2>
        <p style={{ color: '#666', margin: 0 }}>
          You don't have permission to access this page.
        </p>
        <a
          href="/dashboard"
          style={{
            padding: '10px 20px',
            backgroundColor: '#667eea',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '6px',
            marginTop: '10px'
          }}
        >
          Go to Dashboard
        </a>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;