import React, {useEffect} from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { PageSkeleton } from '@/components/glass/Skeleton';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAdmin = false,
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  /* All three branches were inline-styled off-system — the admin denial
     was still painting #667eea, the old purple theme's primary. */
  if (isLoading) {
    return <PageSkeleton label="Checking your sign-in." />;
  }

  // Redirecting to /login. Say so rather than flashing a blank page.
  if (!isAuthenticated) {
    return <PageSkeleton label="Taking you to sign in." />;
  }

  if (requireAdmin && user?.role !== 'admin') {
    return (
      <div className="g-waiting">
        <div className="g-pane g-card g-waiting__inner" style={{ padding: 'var(--s-6)' }}>
          <h1>You don&rsquo;t have access to this</h1>
          <p>
            This page is for admins. Ask someone with an admin account to make the
            change, or to give you admin access.
          </p>
          <a className="g-btn g-btn--primary" href="/dashboard">Back to the dashboard</a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
