"use client";

import { useEffect, useRef } from 'react';

// Global flag to prevent multiple loads
let waveScriptLoaded = false;

export function WavesAnimation() {
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    // Load waves.js only on client side after DOM is ready to avoid hydration errors
    if (typeof window !== 'undefined' && !scriptLoadedRef.current && !waveScriptLoaded) {
      // Wait for DOM to be fully ready
      const loadWaves = () => {
        // Double-check if script already exists (in case of race condition)
        if (document.querySelector('script[src="/assets/js/wave.js"]') || waveScriptLoaded) {
          return;
        }

        // Check if waves container exists
        const wavesContainer = document.querySelector('.waves');
        if (!wavesContainer) {
          return;
        }

        // Mark as loading
        waveScriptLoaded = true;
        scriptLoadedRef.current = true;

        const script = document.createElement('script');
        script.src = '/assets/js/wave.js';
        script.async = true;
        script.id = 'wave-js-script'; // Add ID for easier identification
        
        document.body.appendChild(script);
      };

      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadWaves);
      } else {
        // DOM is already ready
        setTimeout(loadWaves, 100); // Small delay to ensure .waves element exists
      }
    }
  }, []);

  return null; // This component doesn't render anything
}

