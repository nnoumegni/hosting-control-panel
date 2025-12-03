"use client";

import { useEffect, useRef } from 'react';

interface ScrollAnimationOptions {
  threshold?: number;
  rootMargin?: string;
}

export function useScrollAnimation(options: ScrollAnimationOptions = {}) {
  const { threshold = 0.1, rootMargin = '0px' } = options;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const element = entry.target as HTMLElement;
            const cue = element.getAttribute('data-cue');
            const delay = element.getAttribute('data-delay') || '0';

            if (cue) {
              // Add animation class after delay
              setTimeout(() => {
                element.classList.add('animate-in');
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
              }, parseInt(delay));
            }
          }
        });
      },
      {
        threshold,
        rootMargin,
      }
    );

    // Observe all elements with data-cue attribute
    const elements = document.querySelectorAll('[data-cue]');
    elements.forEach((el) => {
      // Set initial state - ensure it's hidden even if CSS hasn't loaded yet
      const elHtml = el as HTMLElement;
      const cue = elHtml.getAttribute('data-cue');
      
      // Only set inline styles if the element doesn't already have the animate-in class
      // This prevents overriding CSS that might have !important
      if (!elHtml.classList.contains('animate-in')) {
        if (cue === 'slideInUp') {
          elHtml.style.opacity = '0';
          elHtml.style.transform = 'translateY(30px)';
          elHtml.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        } else if (cue === 'slideInLeft') {
          elHtml.style.opacity = '0';
          elHtml.style.transform = 'translateX(-30px)';
          elHtml.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        } else if (cue === 'slideInRight') {
          elHtml.style.opacity = '0';
          elHtml.style.transform = 'translateX(30px)';
          elHtml.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        }
      }
      
      observer.observe(el);
    });

    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, [threshold, rootMargin]);
}

