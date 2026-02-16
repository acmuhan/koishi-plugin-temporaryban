import { Context } from 'koishi'
import { Config } from '../config'

export interface MessageItem {
  content: string
  timestamp: number
  messageId?: string
}

export class HistoryService {
  private ctx: Context
  private readonly MAX_HISTORY = 50

  constructor(ctx: Context) {
    this.ctx = ctx
    
    // Cleanup periodically
    ctx.setInterval(() => {
      this.cleanup()
    }, 10 * 60 * 1000) // 10 mins
  }

  public async add(groupId: string, userId: string, content: string, messageId?: string) {
    try {
      await this.ctx.database.create('temporaryban_message_history', {
        groupId,
        userId,
        content,
        timestamp: new Date(),
        messageId
      })
    } catch (err) {
      // Ignore errors for history logging to not block main flow
    }
  }

  public async get(groupId: string, userId: string, limit: number): Promise<MessageItem[]> {
    const records = await this.ctx.database.get('temporaryban_message_history', {
      groupId,
      userId
    }, {
      limit: limit,
      sort: { timestamp: 'desc' }
    })
    
    // Database returns descending (newest first), but we usually want chronological order for context prompt
    // So we reverse it back.
    return records.map(r => ({
      content: r.content,
      timestamp: r.timestamp.getTime(),
      messageId: r.messageId
    })).reverse()
  }

  private async cleanup() {
    const now = Date.now()
    const TTL = 30 * 60 * 1000 // 30 mins retention
    const cutoff = new Date(now - TTL)
    
    try {
      await this.ctx.database.remove('temporaryban_message_history', {
        timestamp: { $lt: cutoff }
      })
    } catch (err) {
      // log error?
    }
  }
}
