import { PublicLayout } from '../../components/public-layout';

export default function ContactPage() {
  return (
    <PublicLayout>
      {/* Breadcrumb */}
      <div className="breadcumb-wrapper" data-bg-src="/assets/img/bg/breadcrumb-bg.png">
        <div className="container">
          <div className="breadcumb-content">
            <h1 className="breadcumb-title">Contact Us</h1>
            <ul className="breadcumb-menu">
              <li>
                <a href="/">Home</a>
              </li>
              <li>Contact</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Contact Section */}
      <section className="space">
        <div className="container">
          <div className="row gy-40">
            <div className="col-xl-4">
              <div className="contact-info-wrap">
                <div className="title-area">
                  <span className="sub-title">Get In Touch</span>
                  <h2 className="sec-title">Contact Information</h2>
                </div>
                <div className="contact-info-list">
                  <div className="info-box">
                    <div className="box-icon">
                      <i className="far fa-map-marker-alt"></i>
                    </div>
                    <div className="media-body">
                      <h3 className="box-title">Location</h3>
                      <p className="box-text">Cloud-based infrastructure</p>
                    </div>
                  </div>
                  <div className="info-box">
                    <div className="box-icon">
                      <i className="far fa-envelope"></i>
                    </div>
                    <div className="media-body">
                      <h3 className="box-title">Email</h3>
                      <a href="mailto:support@hostingcontrolpanel.com" className="box-link">
                        support@hostingcontrolpanel.com
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-xl-8">
              <div className="contact-form-wrap">
                <form className="contact-form">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <input type="text" className="form-control" placeholder="Your Name" required />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <input type="email" className="form-control" placeholder="Your Email" required />
                      </div>
                    </div>
                    <div className="col-12">
                      <div className="form-group">
                        <input type="text" className="form-control" placeholder="Subject" required />
                      </div>
                    </div>
                    <div className="col-12">
                      <div className="form-group">
                        <textarea className="form-control" rows={5} placeholder="Your Message" required></textarea>
                      </div>
                    </div>
                    <div className="col-12">
                      <button type="submit" className="ot-btn">
                        Send Message<i className="far fa-long-arrow-right ms-2"></i>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

