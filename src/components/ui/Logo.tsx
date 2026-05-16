import React from 'react';

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M20 70 A 30 30 0 0 1 50 40 A 30 30 0 0 0 80 10" stroke="currentColor" strokeWidth="12" strokeLinecap="round" className="text-flux-500/80 dark:text-flux-400/80" />
      <path d="M20 90 A 30 30 0 0 1 50 60 A 30 30 0 0 0 80 30" stroke="currentColor" strokeWidth="12" strokeLinecap="round" className="text-flux-600 dark:text-flux-300" />
    </svg>
  );
}
