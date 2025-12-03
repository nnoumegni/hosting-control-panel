"use client";

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface PageLoaderProps {
  isLoading: boolean;
  children: ReactNode;
  message?: string;
  className?: string;
}

export function PageLoader({ isLoading, children, message, className = '' }: PageLoaderProps) {
  if (isLoading) {
    return (
      <div className={`flex items-center justify-center min-h-[400px] ${className}`}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-sm text-slate-400">
            {message || 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

