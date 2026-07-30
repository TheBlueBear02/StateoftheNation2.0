import { redirect } from 'next/navigation'
import { getPipelineById } from '@/content/pipelines'

type PageProps = {
  params: Promise<{ slug: string }>
}

/** Legacy `/piplines/{id}` → `/piplines/docs/{id}` */
export default async function LegacyPipelineRedirect({ params }: PageProps) {
  const { slug } = await params
  if (slug === 'docs') {
    redirect('/piplines/docs')
  }
  if (getPipelineById(slug)) {
    redirect(`/piplines/docs/${slug}`)
  }
  redirect('/piplines')
}
