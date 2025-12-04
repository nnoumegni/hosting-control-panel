import { PublicLayout } from '../../../components/public-layout';

export default function AboutPage() {
  return (
    <PublicLayout>
      {/* Breadcrumb */}
      <div className="breadcumb-wrapper" data-bg-src="/assets/img/bg/breadcrumb-bg.png">
        <div className="container">
          <div className="breadcumb-content">
            <h1 className="breadcumb-title">About Us</h1>
            <ul className="breadcumb-menu">
              <li>
                <a href="/">Home</a>
              </li>
              <li>About Us</li>
            </ul>
          </div>
        </div>
      </div>

      {/* About Section */}
      <div className="about-sec1 position-relative overflow-hidden space">
        <div className="container">
          <div className="row gy-40 align-items-center">
            <div className="col-xl-6">
              <div className="img-box1">
                <div className="img1">
                  <img src="/assets/img/normal/about1-1.png" alt="About" />
                </div>
              </div>
            </div>
            <div className="col-xl-6">
              <div className="about-wrap1">
                <div className="title-area mb-40">
                  <span className="sub-title">About Our Platform</span>
                  <h2 className="sec-title">Your Trusted Hosting Management Solution</h2>
                  <p className="sec-text">
                    A comprehensive control panel designed for modern cloud infrastructure. Manage domains, SSL
                    certificates, databases, and more with an intuitive interface built for AWS EC2 environments.
                  </p>
                </div>
                <div className="row gy-30">
                  <div className="col-md-6">
                    <div className="about-grid">
                      <div className="box-icon">
                        <i className="fal fa-server"></i>
                        <h3 className="box-title h6">Our Mission</h3>
                      </div>
                      <div className="about-grid-details">
                        <p className="box-text">
                          To empower organizations to manage their hosting infrastructure with confidence and ease.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="about-grid">
                      <div className="box-icon">
                        <i className="fal fa-shield-alt"></i>
                        <h3 className="box-title h6">Our Vision</h3>
                      </div>
                      <div className="about-grid-details">
                        <p className="box-text">
                          To be the premier hosting control panel solution, providing security and reliability.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

