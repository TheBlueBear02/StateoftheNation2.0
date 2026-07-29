import type { Metadata } from 'next'
import { KnessetPipelineEditPage } from '@/views/KnessetPipelineEditPage'

export const metadata: Metadata = {
  title: 'סנכרון כנסת',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <KnessetPipelineEditPage />
}
