import type { Metadata } from 'next'
import { KnessetCommitteesPage } from '@/views/KnessetCommitteesPage'

export const metadata: Metadata = {
  title: 'ועדות הכנסת',
  description:
    'ועדות הכנסת ה-25 — בחירת ועדה וישיבה, שולחן חברי הוועדה ותמליל הישיבה.',
  alternates: { canonical: '/knesset/committees' },
}

export default function Page() {
  return <KnessetCommitteesPage />
}
