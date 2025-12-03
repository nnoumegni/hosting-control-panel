"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useScrollAnimation } from '../hooks/use-scroll-animation';
import { useStickyHeader } from '../hooks/use-sticky-header';

interface PublicLayoutProps {
  children: React.ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isSticky = useStickyHeader();
  
  // Initialize scroll animations
  useScrollAnimation();

  // Handle menu toggle and body class
  useEffect(() => {
    if (isMenuOpen) {
      document.body.classList.add('ot-body-visible');
    } else {
      document.body.classList.remove('ot-body-visible');
    }
  }, [isMenuOpen]);

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  const isActive = (path: string) => pathname === path;

  return (
    <>
      {/* Mobile Menu */}
      <div className={`ot-menu-wrapper ${isMenuOpen ? 'active' : ''}`} onClick={(e) => {
        // Close menu when clicking on the overlay
        if (e.target === e.currentTarget) {
          setIsMenuOpen(false);
        }
      }}>
        <div className="ot-menu-area text-center">
          <button className="ot-menu-toggle" onClick={() => setIsMenuOpen(false)}>
            <i className="fal fa-times"></i>
          </button>
          <div className="mobile-logo">
            <Link href="/">
              <img src="/assets/img/logo.svg" alt="Hosting Control Panel" />
            </Link>
          </div>
          <div className="ot-mobile-menu">
            <ul>
              <li className={isActive('/') ? 'active' : ''}>
                <Link href="/" onClick={() => setIsMenuOpen(false)}>Home</Link>
              </li>
              <li className={isActive('/about') ? 'active' : ''}>
                <Link href="/about" onClick={() => setIsMenuOpen(false)}>About</Link>
              </li>
              <li className={isActive('/services') ? 'active' : ''}>
                <Link href="/services" onClick={() => setIsMenuOpen(false)}>Services</Link>
              </li>
              <li className={isActive('/contact') ? 'active' : ''}>
                <Link href="/contact" onClick={() => setIsMenuOpen(false)}>Contact</Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="ot-header header-layout2">
        <div className="header-top">
          <div className="container">
            <div className="row justify-content-xl-between justify-content-center align-items-center gy-2">
              <div className="col-auto">
                <div className="header-links">
                  <ul>
                    <li>
                      <i className="far fa-home"></i>Welcome to <Link href="/">Hosting Control Panel.</Link> Need Help?{' '}
                      <Link href="/contact" className="line-btn">
                        Get in Touch
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="col-auto d-none d-xl-block">
                <div className="header-links">
                  <ul>
                    <li>
                      <i className="fal fa-envelope"></i>{' '}
                      <a href="mailto:support@hostingcontrolpanel.com">support@hostingcontrolpanel.com</a>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={`sticky-wrapper ${isSticky ? 'sticky' : ''}`}>
          <div className="menu-area">
            <div className="container">
              <div className="row align-items-center justify-content-between">
                <div className="col-auto">
                  <div className="header-logo">
                    <Link href="/">
                      <img src="/assets/img/logo.svg" alt="Hosting Control Panel" />
                    </Link>
                  </div>
                </div>
                <div className="col-auto">
                  <nav className="main-menu d-none d-lg-inline-block">
                    <ul>
                      <li className={isActive('/') ? 'active' : ''}>
                        <Link href="/">Home</Link>
                      </li>
                      <li className={isActive('/about') ? 'active' : ''}>
                        <Link href="/about">About</Link>
                      </li>
                      <li className={isActive('/services') ? 'active' : ''}>
                        <Link href="/services">Services</Link>
                      </li>
                      <li className={isActive('/contact') ? 'active' : ''}>
                        <Link href="/contact">Contact</Link>
                      </li>
                    </ul>
                  </nav>
                </div>
                <div className="col-auto">
                  <div className="header-button">
                    <button
                      type="button"
                      className="ot-menu-toggle d-block d-lg-none"
                      onClick={() => setIsMenuOpen(true)}
                    >
                      <i className="far fa-bars"></i>
                    </button>
                    <Link href="/login" className="ot-btn d-none d-xl-flex">
                      Sign In<i className="far fa-long-arrow-right ms-2"></i>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>{children}</main>

      {/* Footer */}
      <footer className="footer-wrapper footer-layout1 space-top">
        <div className="container">
          <div className="footer-top" data-cue="slideInUp">
            <div className="cta-content" data-bg-src="/assets/img/bg/cta_bg_shape1.png">
              <h2 className="mb-0">
                Discover How We Can <span className="text-theme">Support</span> Your Secure Advancement.
              </h2>
              <Link href="/contact" className="ot-btn">
                Get Started<i className="far fa-long-arrow-right ms-2"></i>
              </Link>
            </div>
          </div>
        </div>
        <div className="widget-area">
          <div className="container">
            <div className="row justify-content-between">
              <div className="col-md-6 col-xl-auto" data-cue="slideInUp">
                <div className="widget footer-widget">
                  <div className="ot-widget-about">
                    <div className="about-logo">
                      <Link href="/">
                        <img src="/assets/img/logo.svg" alt="Hosting Control Panel" />
                      </Link>
                    </div>
                    <p className="about-text">
                      Modern alternative to cPanel/WHM for EC2 hosting environments. Manage your infrastructure with ease.
                    </p>
                    <div className="ot-social">
                      <a href="https://www.facebook.com/" target="_blank" rel="noopener noreferrer">
                        <i className="fab fa-facebook-f"></i>
                      </a>
                      <a href="https://www.twitter.com/" target="_blank" rel="noopener noreferrer">
                        <i className="fab fa-twitter"></i>
                      </a>
                      <a href="https://www.linkedin.com/" target="_blank" rel="noopener noreferrer">
                        <i className="fab fa-linkedin-in"></i>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-md-6 col-xl-auto" data-cue="slideInUp">
                <div className="widget widget_nav_menu footer-widget">
                  <h3 className="widget_title">Quick Links</h3>
                  <div className="menu-all-pages-container">
                    <ul className="menu">
                      <li>
                        <Link href="/about">About Us</Link>
                      </li>
                      <li>
                        <Link href="/services">Our Services</Link>
                      </li>
                      <li>
                        <Link href="/contact">Contact</Link>
                      </li>
                      <li>
                        <Link href="/login">Sign In</Link>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="copyright-wrap">
          <div className="container">
            <div className="row justify-content-between align-items-center">
              <div className="col-auto">
                <p className="copyright-text">
                  © {new Date().getFullYear()} Hosting Control Panel. All Rights Reserved.
                </p>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

