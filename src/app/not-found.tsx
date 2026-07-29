import Link from 'next/link'
import { SiteLayout } from '@/components/SiteLayout'

export default function NotFound() {
  return (
    <SiteLayout>
      <main className="container" style={{ paddingBlock: '4rem' }}>
        <h1>העמוד לא נמצא</h1>
        <p>הכתובת שביקשתם אינה קיימת.</p>
        <p>
          <Link href="/">חזרה לדף הבית</Link>
        </p>
      </main>
    </SiteLayout>
  )
}
