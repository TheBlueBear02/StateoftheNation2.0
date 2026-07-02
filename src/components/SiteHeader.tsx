import { Link } from 'react-router-dom'

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner container">
        <Link to="/" className="site-header__logo-link">
          <img
            src="/header-logo%203.svg"
            alt="מצב האומה"
            className="site-logo"
            width={122}
            height={40}
          />
        </Link>
      </div>
    </header>
  )
}
