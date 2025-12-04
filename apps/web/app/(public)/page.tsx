import Link from 'next/link';
import { PublicLayout } from '../../components/public-layout';
import { WavesAnimation } from '../../components/waves-animation';

export default function HomePage() {
  return (
    <PublicLayout>
      {/* Hero Section */}
      <WavesAnimation />
      <div className="ot-hero-wrapper hero-2" id="hero2">
        <div className="waves" suppressHydrationWarning></div>
        <div className="hero-bg-line1">
          <div className="line"></div>
          <div className="line"></div>
          <div className="line"></div>
          <div className="line"></div>
          <div className="line"></div>
          <div className="line d-sm-block d-none"></div>
          <div className="line d-sm-block d-none"></div>
          <div className="line d-sm-block d-none"></div>
          <div className="line d-sm-block d-none"></div>
          <div className="line d-sm-block d-none"></div>
        </div>
        <div className="container">
          <div className="row justify-content-center text-center">
            <div className="col-12">
              <div className="hero-style2">
                <h1 className="hero-title">
                  <span className="title1" data-cue="slideInUp" data-delay="100">
                    Securing Your Digital World,
                  </span>
                  <span className="title2" data-cue="slideInUp" data-delay="200">
                    One Click at a Time
                  </span>
                </h1>
                <p className="hero-text" data-cue="slideInUp" data-delay="300">
                  Modern alternative to cPanel/WHM for EC2 hosting environments. Manage your infrastructure with ease.
                  Provision accounts, automate DNS and SSL, orchestrate backups, and monitor infrastructure health
                  through a secure API and modern dashboard.
                </p>
                <div className="btn-wrap justify-content-center" data-cue="slideInUp" data-delay="400">
                  <Link href="/login" className="ot-btn">
                    Get Started <i className="far fa-long-arrow-right ms-2"></i>
                  </Link>
                  <Link href="/contact" className="video-btn-wrap">
                    <span className="play-btn">
                      <i className="fas fa-play"></i>
                    </span>
                    Learn More
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Area */}
      <section className="feature-area-1 position-relative z-index-common">
        <div className="container">
          <div className="row gy-30">
            <div className="col-lg-4" data-cue="slideInUp">
              <div className="feature-card">
                <div className="box-icon">
                  <img src="/assets/img/icon/feature-icon1-1.svg" alt="icon" />
                </div>
                <h3 className="box-title">Advanced Domain Management</h3>
                <p className="box-text">
                  Proactively manage domains, DNS records, and subdomains with automated configuration and monitoring.
                </p>
              </div>
            </div>
            <div className="col-lg-4" data-cue="slideInUp">
              <div className="feature-card">
                <div className="box-icon">
                  <img src="/assets/img/icon/feature-icon1-2.svg" alt="icon" />
                </div>
                <h3 className="box-title">Robust SSL Protection</h3>
                <p className="box-text">
                  Safeguard your websites with automated SSL certificate issuance and renewal via Let's Encrypt.
                </p>
              </div>
            </div>
            <div className="col-lg-4" data-cue="slideInUp">
              <div className="feature-card">
                <div className="box-icon">
                  <img src="/assets/img/icon/feature-icon1-3.svg" alt="icon" />
                </div>
                <h3 className="box-title">24/7 Infrastructure Monitoring</h3>
                <p className="box-text">
                  Monitor your hosting infrastructure around the clock with real-time metrics and detailed analytics.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <div className="about-sec2 position-relative overflow-hidden space" id="about-sec">
        <div className="shape-mockup bg-gradient-shape1" data-bottom="0" data-right="0" data-left="auto" data-top="auto"></div>
        <div className="container">
          <div className="row gy-40">
            <div className="col-xl-6">
              <div className="img-box2" data-cue="slideInLeft">
                <div className="img1">
                  <div className="img-box2-shape1"></div>
                  <img src="/assets/img/normal/about2-1.png" alt="About" />
                </div>
                <div className="about-experience-wrap jump">
                  <div className="box-icon">
                    <img src="/assets/img/icon/about-icon2-1.svg" alt="icon" />
                  </div>
                  <div className="about-counter-wrap">Trusted By 5k Clients</div>
                </div>
              </div>
            </div>
            <div className="col-xl-6">
              <div className="about-wrap2">
                <div className="title-area mb-25">
                  <span className="sub-title style2" data-cue="slideInUp">
                    About Our Platform
                  </span>
                  <h2 className="sec-title" data-cue="slideInUp" data-delay="100">
                    Innovation at the Core Driving the Future of Hosting
                  </h2>
                  <p className="sec-text" data-cue="slideInUp" data-delay="200">
                    A comprehensive control panel designed for modern cloud infrastructure. Manage domains, SSL
                    certificates, databases, and more with an intuitive interface built for AWS EC2 environments.
                  </p>
                </div>
                <div className="check-list style-grid" data-cue="slideInUp">
                  <ul>
                    <li>
                      <i className="fas fa-check-circle"></i> Domain & DNS Management
                    </li>
                    <li>
                      <i className="fas fa-check-circle"></i> Automated SSL Certificates
                    </li>
                    <li>
                      <i className="fas fa-check-circle"></i> Database Administration
                    </li>
                    <li>
                      <i className="fas fa-check-circle"></i> Security & Firewall
                    </li>
                    <li>
                      <i className="fas fa-check-circle"></i> Real-time Monitoring
                    </li>
                    <li>
                      <i className="fas fa-check-circle"></i> Email Management
                    </li>
                  </ul>
                </div>
                <div className="btn-wrap mt-35" data-cue="slideInUp">
                  <Link href="/about" className="ot-btn">
                    More About Us<i className="far fa-long-arrow-right ms-2"></i>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Services Section */}
      <section className="bg-top-center bg-smoke space overflow-hidden" id="service-sec" data-bg-src="/assets/img/bg/bg-wave-shape1.png">
        <div className="container">
          <div className="title-area text-center">
            <span className="sub-title style2" data-cue="slideInUp">
              What We Offer
            </span>
            <h2 className="sec-title" data-cue="slideInUp">
              Hosting Management Solutions
            </h2>
          </div>
          <div className="row justify-content-center">
            {[
              {
                number: '01',
                title: 'Domain & DNS Management',
                description: 'Manage domains, DNS records, and subdomains with automated configuration and monitoring.',
                image: '/assets/img/service/service2-1.jpg',
              },
              {
                number: '02',
                title: 'SSL Certificate Automation',
                description: 'Automated SSL certificate issuance and renewal via Let\'s Encrypt with support for wildcard certificates.',
                image: '/assets/img/service/service2-2.jpg',
              },
              {
                number: '03',
                title: 'Database Administration',
                description: 'Create and manage MySQL databases, users, and permissions with automated backups and monitoring.',
                image: '/assets/img/service/service2-3.jpg',
              },
            ].map((service, idx) => (
              <div key={idx} className="col-12 service-list-wrap" data-cue="slideInUp">
                <div className={`service-list hover-item ${idx === 1 ? 'item-active' : ''}`}>
                  <div className="box-number">{service.number}</div>
                  <div className="box-content">
                    <h3 className="box-title">
                      <Link href="/services">{service.title}</Link>
                    </h3>
                    <p className="box-text">{service.description}</p>
                  </div>
                  <div className="box-img">
                    <img src={service.image} alt={service.title} />
                  </div>
                  <div className="btn-wrap">
                    <Link href="/services" className="ot-btn style-border">
                      Read More<i className="far fa-long-arrow-right ms-2"></i>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
