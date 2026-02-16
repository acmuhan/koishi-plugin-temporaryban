import { Session } from 'koishi'
import { Config } from '../config'

export function checkPermission(session: Session, config: Config): boolean {
  if (!session?.userId) return false
  // 1. Global Admin
  if (config.adminList?.includes(session.userId)) return true
  // 2. Group Admin/Owner (Dynamic)
  const roles = session.author?.roles || []
  return roles.includes('admin') || roles.includes('owner')
}
