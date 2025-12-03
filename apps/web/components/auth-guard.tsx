"use client";

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        if (!token) {
          setIsAuthenticated(false);
          router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }

        // Try to verify token by making a lightweight API call
        // If it fails, try to refresh the token
        try {
          // Make a test call to verify token
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'https://localhost:4000/api'}/settings/server`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });

          if (response.status === 401) {
            // Token expired, try to refresh
            const refreshToken = localStorage.getItem('refreshToken');
            if (refreshToken) {
              try {
                const refreshResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'https://localhost:4000/api'}/auth/refresh`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ refreshToken }),
                });

                if (refreshResponse.ok) {
                  const data = await refreshResponse.json();
                  localStorage.setItem('accessToken', data.accessToken);
                  localStorage.setItem('refreshToken', data.refreshToken);
                  setIsAuthenticated(true);
                } else {
                  throw new Error('Token refresh failed');
                }
              } catch (refreshError) {
                // Refresh failed, redirect to login
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('user');
                setIsAuthenticated(false);
                router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
              }
            } else {
              throw new Error('No refresh token');
            }
          } else if (response.ok) {
            setIsAuthenticated(true);
          } else {
            throw new Error('Token verification failed');
          }
        } catch (verifyError) {
          // If verification fails, assume token is invalid
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          setIsAuthenticated(false);
          router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthenticated(false);
        router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      } finally {
        setIsChecking(false);
      }
    };

    checkAuth();
  }, [router, pathname]);

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-brand"></div>
          <p className="text-sm text-slate-400">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Redirect will happen
  }

  return <>{children}</>;
}

