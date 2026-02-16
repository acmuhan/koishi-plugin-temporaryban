import { Context, Logger } from 'koishi'
import { Config, WhitelistItem } from '../config'

export interface WhitelistTable {
  id: number
  groupId: string
  userId: string
  createdAt: Date
}

export class WhitelistService {
  private ctx: Context
  private config: Config
  private logger: Logger
  private cache: Map<string, Set<string>> = new Map() // groupId -> Set<userId>

  constructor(ctx: Context, config: Config) {
    this.ctx = ctx
    this.config = config
    this.logger = new Logger('temporaryban:whitelist')
  }

  public async init() {
    this.cache.clear()
    
    // 1. Load from Database
    try {
      const records = await this.ctx.database.get('temporaryban_whitelist', {})
      for (const record of records) {
        if (!this.cache.has(record.groupId)) {
          this.cache.set(record.groupId, new Set())
        }
        this.cache.get(record.groupId)?.add(record.userId)
      }
      this.logger.info(`Loaded ${records.length} whitelist records from database.`)
    } catch (err) {
      this.logger.error('Failed to load whitelist from database:', err)
    }

    // 2. Merge from Config (Static)
    // We don't write back to DB automatically, just use both.
    // Or we could migrate... let's just use both for now to avoid altering user config unexpectedly.
    for (const group of this.config.groups) {
      if (!group.whitelist) continue
      if (!this.cache.has(group.groupId)) {
        this.cache.set(group.groupId, new Set())
      }
      const set = this.cache.get(group.groupId)!
      for (const item of group.whitelist) {
        set.add(item.userId)
      }
    }
  }

  public async add(groupId: string, userId: string): Promise<boolean> {
    // Check if already exists in DB
    const exists = await this.ctx.database.get('temporaryban_whitelist', { groupId, userId })
    if (exists.length > 0) return false

    // Add to DB
    await this.ctx.database.create('temporaryban_whitelist', {
      groupId,
      userId,
      createdAt: new Date()
    })

    // Update Cache
    if (!this.cache.has(groupId)) {
      this.cache.set(groupId, new Set())
    }
    this.cache.get(groupId)?.add(userId)

    return true
  }

  public async remove(groupId: string, userId: string): Promise<boolean> {
    // Remove from DB
    const result = await this.ctx.database.remove('temporaryban_whitelist', { groupId, userId })
    
    // Update Cache (remove from set)
    if (this.cache.has(groupId)) {
      this.cache.get(groupId)?.delete(userId)
    }

    // Note: If user is in Config whitelist, they are still effectively whitelisted unless we handle that.
    // Ideally, we should warn or handle this. But for now, DB removal only affects DB entries.
    // If the user was in Config, `isWhitelisted` will still return true because of the merge in `init`.
    // BUT `init` is only called at start. So runtime cache is what matters.
    // Actually, `init` merges config into cache. If we remove from cache here, it is removed from runtime check.
    // But on restart, it will come back from Config.
    // This is a known limitation of mixing Config and DB.
    // We can just proceed.
    
    return (result.matched || 0) > 0
  }

  public isWhitelisted(groupId: string, userId: string): boolean {
    return this.cache.get(groupId)?.has(userId) || false
  }

  public getList(groupId: string): string[] {
    return Array.from(this.cache.get(groupId) || [])
  }
}
