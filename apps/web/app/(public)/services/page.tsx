import Link from 'next/link';
import { PublicLayout } from '../../../components/public-layout';

export default function ServicesPage() {
  return (
    <PublicLayout>
      {/* Breadcrumb */}
      <div className="breadcumb-wrapper" data-bg-src="/assets/img/bg/breadcrumb-bg.png">
        <div className="container">
          <div className="breadcumb-content">
            <h1 className="breadcumb-title">Our Services</h1>
            <ul className="breadcumb-menu">
              <li>
                <a href="/">Home</a>
              </li>
              <li>Services</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Services Section */}
      <section className="overflow-hidden space-bottom">
        <div className="container">
          <div className="title-area text-center">
            <span className="sub-title">Our Services</span>
            <h2 className="sec-title">Comprehensive Hosting Management</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 justify-items-center">
            {[
              {
                icon: 'fa-globe',
                title: 'Domain Management',
                description: 'Manage domains, DNS records, and subdomains with ease. Automated DNS configuration and monitoring.',
              },
              {
                icon: 'fa-lock',
                title: 'SSL Certificates',
                description: 'Automated SSL certificate issuance and renewal via Let\'s Encrypt. Support for wildcard certificates.',
              },
              {
                icon: 'fa-database',
                title: 'Database Management',
                description: 'Create and manage MySQL databases, users, and permissions. Automated backups and monitoring.',
              },
              {
                icon: 'fa-shield-alt',
                title: 'Security & Firewall',
                description: 'Advanced firewall management, DDoS protection, and security analytics to keep your infrastructure safe.',
              },
              {
                icon: 'fa-chart-line',
                title: 'Monitoring & Analytics',
                description: 'Real-time monitoring, performance metrics, and detailed analytics for your hosting infrastructure.',
              },
              {
                icon: 'fa-envelope',
                title: 'Email Management',
                description: 'Configure email accounts, forwarders, and spam filters. Full email hosting capabilities.',
              },
            ].map((service, idx) => (
              <div key={idx} className="w-full max-w-sm">
                <div className="service-card">
                  <div className="box-icon">
                    <i className={`fal ${service.icon}`}></i>
                  </div>
                  <h3 className="box-title">
                    <Link href="/services">{service.title}</Link>
                  </h3>
                  <p className="box-text">{service.description}</p>
                  <Link href="/services" className="link-btn style-gradient">
                    Read More<i className="far fa-long-arrow-right ms-2"></i>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

