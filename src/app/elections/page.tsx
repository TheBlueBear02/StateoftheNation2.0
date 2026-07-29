import type { Metadata } from 'next'
import { ElectionsPage } from '@/views/ElectionsPage'

export const metadata: Metadata = {
  title: 'בחירות 2026',
  description:
    'מפלגות מאושרות, מועמדים ומפת מושבים לקראת בחירות 2026 לכנסת.',
  alternates: { canonical: '/elections' },
}

export default function Page() {
  return <ElectionsPage />
}
