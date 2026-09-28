/** Timeline edit UI + write APIs are local-dev only (not production). */
export function isTimelineEditEnabled(): boolean {
  return process.env.NODE_ENV === 'development'
}
