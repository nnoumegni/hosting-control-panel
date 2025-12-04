"use client";

import { useEffect } from 'react';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Only load template CSS if we're on a public page (not dashboard)
    const isDashboard = window.location.pathname.startsWith('/dashboard');
    if (isDashboard) {
      return; // Don't load template CSS for dashboard
    }

    // Load template CSS only for public pages
    const loadCSS = (href: string, id: string) => {
      if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.id = id;
        document.head.appendChild(link);
      }
    };

    // Load Google Fonts
    const loadGoogleFonts = () => {
      if (!document.getElementById('google-fonts-preconnect-1')) {
        const preconnect1 = document.createElement('link');
        preconnect1.rel = 'preconnect';
        preconnect1.href = 'https://fonts.googleapis.com';
        preconnect1.id = 'google-fonts-preconnect-1';
        document.head.appendChild(preconnect1);

        const preconnect2 = document.createElement('link');
        preconnect2.rel = 'preconnect';
        preconnect2.href = 'https://fonts.gstatic.com';
        preconnect2.crossOrigin = 'anonymous';
        preconnect2.id = 'google-fonts-preconnect-2';
        document.head.appendChild(preconnect2);

        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Kumbh+Sans:wght@100..900&display=swap';
        fontLink.rel = 'stylesheet';
        fontLink.id = 'google-fonts-kumbh';
        document.head.appendChild(fontLink);
      }
    };

    loadCSS('/assets/css/bootstrap.min.css', 'public-bootstrap');
    loadCSS('/assets/css/fontawesome.min.css', 'public-fontawesome');
    loadCSS('/assets/css/style.css', 'public-style');
    loadGoogleFonts();

    // Add no-js class for template compatibility
    document.documentElement.classList.add('no-js');
  }, []);

  return <>{children}</>;
}

