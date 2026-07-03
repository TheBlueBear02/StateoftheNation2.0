import type { ReactNode } from 'react'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'
import '../App.css'

type SiteLayoutProps = {
  children: ReactNode
  className?: string
}

export function SiteLayout({ children, className }: SiteLayoutProps) {
  return (
    <div className={className ? `site ${className}` : 'site'} dir="rtl">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  )
}
