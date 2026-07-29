'use client'

import Link from 'next/link'
import type { MouseEvent } from 'react'
import './PageBreadcrumb.css'

export type PageBreadcrumbItem = {
  label: string
  to?: string
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
}

type PageBreadcrumbProps = {
  items: PageBreadcrumbItem[]
  className?: string
}

export function PageBreadcrumb({ items, className }: PageBreadcrumbProps) {
  if (items.length === 0) return null

  return (
    <p
      className={
        className ? `page-breadcrumb ${className}` : 'page-breadcrumb'
      }
    >
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="page-breadcrumb__item">
          {index > 0 ? (
            <span className="page-breadcrumb__sep" aria-hidden="true">
              {' / '}
            </span>
          ) : null}
          {item.to ? (
            <Link href={item.to} onClick={item.onClick}>
              {item.label}
            </Link>
          ) : (
            <span>{item.label}</span>
          )}
        </span>
      ))}
    </p>
  )
}
