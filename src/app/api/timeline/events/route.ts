import { NextResponse } from 'next/server'
import type { TimelineEvent } from '@/content/timeline/types'
import {
  assertTimelineEditAllowed,
  mutateTimelineEvent,
} from '@/lib/timeline/persistEvent'

export const runtime = 'nodejs'

interface Body {
  action?: 'upsert' | 'delete'
  event?: TimelineEvent
  personIds?: string[]
  previousPersonIds?: string[]
}

export async function POST(request: Request) {
  try {
    assertTimelineEditAllowed(request.headers.get('x-timeline-edit-secret'))
    const body = (await request.json()) as Body
    if (!body.action || !body.event) {
      return NextResponse.json(
        { error: 'action and event are required' },
        { status: 400 },
      )
    }
    await mutateTimelineEvent({
      action: body.action,
      event: body.event,
      personIds: body.personIds ?? [],
      previousPersonIds: body.previousPersonIds,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status =
      message === 'Unauthorized timeline edit'
        ? 401
        : message.includes('required') ||
            message.includes('Invalid') ||
            message.includes('Incomplete') ||
            message.includes('needs') ||
            message.includes('Unknown person')
          ? 400
          : 500
    return NextResponse.json({ error: message }, { status })
  }
}
