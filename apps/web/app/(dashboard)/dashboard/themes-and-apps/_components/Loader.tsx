'use client';

export function Loader() {
  return (
    <div className="flex flex-col items-center justify-center p-16">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-sky-500"></div>
      <p className="mt-4 text-sm text-slate-400">Loading...</p>
    </div>
  );
}

