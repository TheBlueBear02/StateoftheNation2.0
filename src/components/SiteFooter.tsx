const SOCIAL_LINKS = [
  {
    href: 'https://x.com/nationstateIL',
    label: 'X (טוויטר)',
    icon: 'x-icon',
    viewBox: '0 0 19 19',
  },
  {
    href: 'https://instagram.com/stateofthenationIL',
    label: 'אינסטגרם',
    icon: 'instagram-icon',
    viewBox: '0 0 24 24',
  },
  {
    href: 'https://www.facebook.com/people/%D7%9E%D7%A6%D7%91-%D7%94%D7%90%D7%95%D7%9E%D7%94-State-of-the-Nation-IL/61576933410166/',
    label: 'פייסבוק',
    icon: 'facebook-icon',
    viewBox: '0 0 24 24',
  },
] as const

function SocialIcon({
  icon,
  viewBox,
}: {
  icon: (typeof SOCIAL_LINKS)[number]['icon']
  viewBox: string
}) {
  return (
    <svg
      className="site-footer__social-icon"
      viewBox={viewBox}
      width={20}
      height={20}
      aria-hidden="true"
    >
      <use href={`/icons.svg#${icon}`} />
    </svg>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner container">
        <p className="site-footer__brand">מצב האומה</p>

        <nav className="site-footer__social" aria-label="רשתות חברתיות">
          <ul className="site-footer__social-list">
            {SOCIAL_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="site-footer__social-link"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.label}
                >
                  <SocialIcon icon={link.icon} viewBox={link.viewBox} />
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <p className="site-footer__copy">
          © {new Date().getFullYear()} מצב האומה. כל הזכויות שמורות.
        </p>
      </div>
    </footer>
  )
}
