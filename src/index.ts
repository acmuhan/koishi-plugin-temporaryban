import { Context, Schema, Session, Time, Logger } from 'koishi'
import { randomUUID } from 'crypto'

export const name = 'koishi-plugin-qq-jinyan-xiaoyu'

// Logger definition
const logger = new Logger('qq-jinyan-xiaoyu')

// --- Configuration Interfaces ---

export interface BadWordItem {
  code: string
  word: string
}

export interface WhitelistItem {
  qq: string
}

export interface GroupConfig {
  id: string
  groupId: string
  badWordDict: string
  whitelist: WhitelistItem[]
  triggerTimes: number
  triggerMinutes: number
  muteMinutes: number
}

export interface Config {
  groups: GroupConfig[]
}

// --- Schema Definition ---

export const Config: Schema<Config> = Schema.object({
  groups: Schema.array(
    Schema.object({
      id: Schema.string().hidden().default(() => randomUUID()),
      groupId: Schema.string()
        .description('监管群号（第三方机器人群号，仅填数字）')
        .required(),
      badWordDict: Schema.string()
        .description('违禁词字典（严格格式：(1.违禁词1)(2.违禁词2)）')
        .default(''),
      whitelist: Schema.array(
        Schema.object({
          qq: Schema.string().description('白名单用户ID')
        })
      )
        .description('本群白名单用户（跳过所有检测）')
        .role('table'),
      triggerTimes: Schema.number()
        .description('累计违禁触发禁言次数（最小值1）')
        .default(3)
        .min(1),
      triggerMinutes: Schema.number()
        .description('违禁统计时间窗口（分钟）')
        .default(5)
        .min(0.1),
      muteMinutes: Schema.number()
        .description('禁言时长（分钟）')
        .default(10)
        .min(0.1),
    }).description('单群监管配置项')
  ).description('监管群列表')
    .default([])
    .role('list')
}).description('QQ禁言小语 - 插件配置')

// --- Runtime State Interfaces ---

interface UserRecord {
  count: number
  firstTime: number
}

// --- Plugin Implementation ---

export function apply(ctx: Context, config: Config) {
  // Runtime state storage
  // Key: groupId, Value: Parsed BadWordItems
  const parsedBadWordsCache = new Map<string, BadWordItem[]>()
  
  // Key: groupId-userId, Value: UserRecord
  const userRecords = new Map<string, UserRecord>()
  
  // Key: groupId-userId, Value: last message timestamp
  const messageThrottle = new Map<string, number>()
  
  const THROTTLE_LIMIT = 100 // 100ms throttle

  // Helper to parse bad words
  function parseBadWordDict(dictStr: string): BadWordItem[] {
    const result: BadWordItem[] = []
    if (!dictStr || !dictStr.trim()) return result
    const reg = /\(([^.]+)\.(.+?)\)/g
    let match
    while ((match = reg.exec(dictStr)) !== null) {
      result.push({ code: match[1].trim(), word: match[2].trim() })
    }
    return result
  }

  // Initialize cache
  function initCache() {
    parsedBadWordsCache.clear()
    for (const group of config.groups) {
      if (!group.groupId) continue
      const parsed = parseBadWordDict(group.badWordDict)
      parsedBadWordsCache.set(group.groupId, parsed)
      
      if (parsed.length === 0 && group.badWordDict.trim()) {
        logger.warn(`Group ${group.groupId} bad word dictionary format error.`)
      }
    }
  }

  // Initialize on startup and config change
  ctx.on('ready', () => {
    initCache()
    logger.info('Plugin initialized.')
    logger.info(`Monitored groups: ${config.groups.map(g => g.groupId).join(', ') || 'None'}`)
  })
  
  // Clean up throttle and user records periodically
  ctx.setInterval(() => {
    const now = Date.now()
    messageThrottle.clear()
    
    // Optional: Clean up old user records to save memory
    // Iterate and remove records older than max trigger window?
    // For simplicity, we just keep them until restart or they expire naturally in logic
  }, 60 * 1000)

  ctx.on('message', async (session: Session) => {
    // Basic filtering
    if (
      session.type !== 'group' ||
      !session.content ||
      session.selfId === session.userId ||
      !session.guildId // standardized field for group ID
    ) return

    // Ensure it's a text message (roughly)
    const elements = session.elements || []
    if (!elements.some((el: any) => el.type === 'text')) return

    const groupId = session.guildId
    const userId = session.userId
    const messageId = session.messageId

    // Ensure required fields are present
    if (!userId) return

    // Find config for this group
    const groupConfig = config.groups.find(g => g.groupId === groupId)
    if (!groupConfig) return // Not monitored

    // Throttle check
    const throttleKey = `${groupId}-${userId}`
    const now = Date.now()
    if (messageThrottle.has(throttleKey) && now - messageThrottle.get(throttleKey)! < THROTTLE_LIMIT) {
      return
    }
    messageThrottle.set(throttleKey, now)

    // Whitelist check
    if (groupConfig.whitelist.some(w => w.qq === userId)) {
      logger.debug(`User ${userId} in group ${groupId} is whitelisted.`)
      return
    }

    // Bad word check
    const badWords = parsedBadWordsCache.get(groupId) || []
    if (badWords.length === 0) return

    // session.content is guaranteed not null here due to early return
    const content = session.content!
    const matchItem = badWords.find(item => content.includes(item.word))
    if (!matchItem) return

    // --- Violation Detected ---
    logger.warn(`Violation: Group ${groupId} User ${userId} used "${matchItem.word}"`)

    // 1. Recall Message
    if (messageId) {
      try {
        if (session.bot.deleteMessage) {
          await session.bot.deleteMessage(groupId, messageId)
        } else {
          // Fallback for non-standard adapters (like OneBot legacy)
          const bot = session.bot as any
          if (bot.delete_msg) {
            await bot.delete_msg({ group_id: groupId, message_id: messageId })
          } else {
            logger.warn('No delete message method available.')
          }
        }
        logger.info(`Recalled message ${messageId}`)
      } catch (err) {
        logger.error(`Failed to recall message: ${err}`)
      }
    } else {
      logger.warn('Message ID missing, cannot recall.')
    }

    // 2. Track Violation Count
    const recordKey = `${groupId}-${userId}`
    let record = userRecords.get(recordKey)
    const triggerWindow = groupConfig.triggerMinutes * Time.minute

    if (!record) {
      record = { count: 1, firstTime: now }
      userRecords.set(recordKey, record)
    } else {
      if (now - record.firstTime > triggerWindow) {
        // Window expired, reset
        record.count = 1
        record.firstTime = now
      } else {
        record.count++
      }
    }

    logger.info(`Violation count for ${userId}: ${record.count}/${groupConfig.triggerTimes}`)

    // 3. Mute if threshold reached
    if (record.count >= groupConfig.triggerTimes) {
      const muteDurationSeconds = Math.floor(groupConfig.muteMinutes * 60)
      try {
        if (session.bot.muteGuildMember) {
           // Standard API: guildId, userId, duration (milliseconds)
           await session.bot.muteGuildMember(groupId, userId, muteDurationSeconds * 1000)
        } else {
           // Fallback
           const bot = session.bot as any
           if (bot.set_group_ban) {
             await bot.set_group_ban(groupId, userId, muteDurationSeconds)
           } else {
             logger.warn('No mute member method available.')
           }
        }
        
        logger.success(`Muted user ${userId} for ${groupConfig.muteMinutes} minutes.`)
        // Reset record after punishment
        userRecords.delete(recordKey)
      } catch (err) {
        logger.error(`Failed to mute user: ${err}`)
      }
    }
  })
}
