'use client';
import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getCurrentTheme, setTheme as applyGlassTheme, type GlassTheme } from '@/components/glass/theme';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setThemeState] = useState<GlassTheme>('light');

  const router = useRouter();
  const { login } = useAuth();

  useEffect(() => {
    setThemeState(getCurrentTheme());
  }, []);

  const toggleTheme = () => {
    const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
    setThemeState(next);
    if (window.Glass) {
      applyGlassTheme(next);
      return;
    }
    document.documentElement.setAttribute('data-theme', next);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const success = await login(email, password);
      
      if (success) {
        // Navigate to dashboard on successful login
        router.push('/dashboard');
      } else {
        setError('Invalid email or password');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Theme Toggle */}
      <div className="login-theme-toggle">
        <button
          onClick={toggleTheme}
          className="theme-toggle-btn"
          aria-label="Toggle theme"
        >
          <div className={`toggle-track ${theme}`}>
            <div className="toggle-thumb"></div>
          </div>
        </button>
      </div>

      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon">🏠</div>
            <h1>ESP32 SMART HOME</h1>
            <p className="login-subtitle">SECURE ACCESS CONTROL</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="login-error">
                <span>⚠</span>
                {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">EMAIL ADDRESS</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                placeholder="user@example.com"
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">PASSWORD</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="login-submit-btn"
            >
              {isLoading ? (
                <>
                  <span className="btn-spinner"></span>
                  AUTHENTICATING...
                </>
              ) : (
                'SIGN IN'
              )}
            </button>
          </form>

          <div className="login-footer">
            <p>POWERED BY ESP32 | SECURED CONNECTION</p>
          </div>
        </div>
      </div>
    </div>
  );
}
