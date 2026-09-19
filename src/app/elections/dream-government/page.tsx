import type { Metadata } from 'next'
import { DreamGovernmentPage } from '@/views/DreamGovernmentPage'

export const metadata: Metadata = {
  title: 'ממשלת החלומות',
  description:
    'בחרו ראש/ת ממשלה ושרים מבין המועמדים לכנסת ובנו את ממשלת החלומות שלכם לקראת בחירות 2026.',
  alternates: { canonical: '/elections/dream-government' },
}

export default function Page() {
  return <DreamGovernmentPage />
}
