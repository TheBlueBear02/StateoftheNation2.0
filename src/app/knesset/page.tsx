import type { Metadata } from 'next'
import { KnessetPage } from '@/views/KnessetPage'

export const metadata: Metadata = {
  title: 'הכנסת',
  description:
    'המיצייקל של הכנסת — סיעות, חברי כנסת ופריסת קואליציה מול אופוזיציה.',
  alternates: { canonical: '/knesset' },
}

export default function Page() {
  return <KnessetPage />
}
