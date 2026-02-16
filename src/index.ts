import { Context, Session, Time, Logger, h } from 'koishi'
import { Config, BadWordTable } from './config'
import { DetectorService } from './services/detector'
import { MailerService } from './services/mailer'
import { HistoryService } from './services/history'
import { WhitelistService, WhitelistTable } from './services/whitelist'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'
import { UserRecord } from './utils/types'
import { registerCommands } from './commands'

export * from './config'

export const name = 'koishi-plugin-temporaryban'
export const inject = ['database', 'http']

export interface IgnoredWordTable {
  id: number
  groupId: string
  word: string
  createdAt: Date
}

export interface ViolationTable {
  id: number
  userId: string
  groupId: string
  words: string[]
  content: string
  timestamp: Date
}

declare module 'koishi' {
  interface Tables {
    temporaryban_badwords: BadWordTable
    temporaryban_message_history: MessageHistoryTable
    temporaryban_whitelist: WhitelistTable
    temporaryban_ignored_words: IgnoredWordTable
    temporaryban_violations: ViolationTable
  }
  
  interface Context {
    console: any
  }
}

export interface MessageHistoryTable {
  id: number
  groupId: string
  userId: string
  content: string
  timestamp: Date
  messageId?: string
}

const logger = new Logger('temporaryban')

export function apply(ctx: Context, config: Config) {
  // --- Services ---
  const history = new HistoryService(ctx)
  const detector = new DetectorService(ctx, config, history)
  const mailer = new MailerService(ctx, config) // Pass context for baseDir access
  const whitelistService = new WhitelistService(ctx, config)

  // --- Runtime State ---
  const userRecords = new Map<string, UserRecord>() // Key: groupId-userId
  const messageThrottle = new Map<string, number>()
  const THROTTLE_LIMIT = 500 // 500ms

  // --- Database Model ---
  ctx.model.extend('temporaryban_badwords', {
    id: 'unsigned',
    groupId: 'string',
    word: 'string',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
  })

  ctx.model.extend('temporaryban_message_history', {
    id: 'unsigned',
    groupId: 'string',
    userId: 'string',
    content: 'text',
    timestamp: 'timestamp',
    messageId: 'string',
  }, {
    autoInc: true,
  })

  ctx.model.extend('temporaryban_whitelist', {
    id: 'unsigned',
    groupId: 'string',
    userId: 'string',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
  })

  ctx.model.extend('temporaryban_ignored_words', {
    id: 'unsigned',
    groupId: 'string',
    word: 'string',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
  })

  ctx.model.extend('temporaryban_violations', {
    id: 'unsigned',
    userId: 'string',
    groupId: 'string',
    words: 'list',
    content: 'text',
    timestamp: 'timestamp',
  }, {
    autoInc: true,
  })

  // --- Lifecycle ---
  ctx.on('ready', async () => {
    logger.info('Plugin initialized.')
    logger.info(`Monitored groups: ${config.groups.length}`)
    
    // Initialize services
    try {
      await detector.init()
      await whitelistService.init()
    } catch (err) {
      logger.error('Failed to initialize services:', err)
    }
    
    if (config.debug) {
      logger.info('Debug mode enabled. Detailed logs will be output.')
    }
  })

  // --- Console Integration ---
  if (ctx.console) {
    ctx.console.addEntry({
      dev: '../client/index.ts',
      prod: '../dist/client/index.js',
    })

    ctx.console.addListener('temporaryban/get-stats', async () => {
      try {
        const now = new Date()
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        
        const totalViolations = await ctx.database.eval('temporaryban_violations', { $count: 'id' } as any)
        const todayViolations = await ctx.database.eval('temporaryban_violations', { 
          $count: 'id',
          $where: { timestamp: { $gte: todayStart } }
        } as any)

        const activeGroups = config.groups.filter(g => g.enable).length

        const recentRecords = await ctx.database.get('temporaryban_violations', {}, {
          limit: 10,
          sort: { timestamp: 'desc' }
        })

        return {
          stats: {
            totalViolations,
            todayViolations,
            activeGroups
          },
          recentRecords
        }
      } catch (err) {
        logger.error('Failed to fetch console stats:', err)
        return { stats: {}, recentRecords: [] }
      }
    })
  }

  // --- I18n ---
  ctx.i18n.define('zh-CN', zhCN)
  ctx.i18n.define('en-US', enUS)

  // Cleanup throttle periodically
  ctx.setInterval(() => {
    messageThrottle.clear()
  }, 60 * 1000)

  // --- Register Commands ---
  registerCommands(ctx, config, detector, mailer, userRecords, history, whitelistService)

  // --- Message Handler ---
  ctx.on('message', async (session: Session) => {
    // Debug log for every message received
    if (config.debug) {
      logger.info(`[DEBUG] Received message: Platform=${session.platform}, Type=${session.type}, Subtype=${session.subtype}, GuildId=${session.guildId}, ChannelId=${session.channelId}, UserId=${session.userId}, Content=${session.content}`)
    }

    // Relaxed filtering logic with debug logging
    const isGroup = session.guildId || session.subtype === 'group' || session.type === 'group'
    if (!isGroup) {
      if (config.debug) logger.debug(`[DEBUG] Ignored: Not a group message.`)
      return
    }

    if (
      !session.content ||
      session.selfId === session.userId
    ) {
      if (config.debug) logger.debug(`[DEBUG] Ignored: No content or self message.`)
      return
    }

    const elements = session.elements || []
    if (!elements.some((el: any) => el.type === 'text')) {
      if (config.debug) logger.debug(`[DEBUG] Ignored: No text element.`)
      return
    }

    // Normalize groupId: Use guildId (standard) or channelId (fallback for some adapters)
    const groupId = session.guildId || session.channelId
    const userId = session.userId
    const messageId = session.messageId

    if (!groupId || !userId) {
      if (config.debug) logger.warn(`[DEBUG] Ignored: Missing groupId or userId.`)
      return
    }

    // Config Check
    // Compare as strings to avoid type mismatch issues
    const groupConfig = config.groups.find(g => g.groupId === groupId)
    
    if (!groupConfig) {
      if (config.debug) logger.debug(`[DEBUG] Ignored: Group ${groupId} is not in monitored list.`)
      return
    }
    
    if (!groupConfig.enable) {
      if (config.debug) logger.debug(`[DEBUG] Ignored: Monitoring disabled for group ${groupId}.`)
      return
    }

    // --- Dynamic Admin Whitelist Check ---
    // Automatically detect if user is admin or owner in OneBot (and other supported adapters)
    // session.author.roles usually contains ['owner', 'admin', 'member']
    const userRoles = session.author?.roles || []
    if (userRoles.includes('admin') || userRoles.includes('owner')) {
      if (config.debug) {
        logger.debug(`[Group: ${groupId}] [User: ${userId}] Skipped: User is admin/owner (Dynamic Whitelist).`)
      }
      return
    }

    // --- Bot Admin Permission Check ---
    if (config.checkAdmin) {
      try {
        const botMember = await session.bot.getGuildMember(groupId, session.bot.selfId)
        const botRoles = botMember?.roles || []
        const isBotAdmin = botRoles.includes('admin') || botRoles.includes('owner')
        
        if (config.debug) {
           logger.debug(`[Group: ${groupId}] Bot Roles: ${botRoles.join(', ')}. Admin? ${isBotAdmin}`)
        }

        if (!isBotAdmin) {
          if (config.debug) {
            logger.debug(`[Group: ${groupId}] Skipped: Bot is not admin/owner.`)
          }
          return
        }
      } catch (err) {
        // If failed to get member info (e.g. platform not supported), log warning but maybe proceed or skip?
        // Safe default: Skip to avoid errors or ineffective actions.
        logger.warn(`[Group: ${groupId}] Failed to check bot permission: ${err}`)
        if (config.debug) return 
      }
    }

    // --- Global Default Fallback Logic ---
    // Merge group config with global defaults
    const effectiveConfig = {
      ...groupConfig,
      muteMinutes: groupConfig.muteMinutes ?? config.defaultMuteMinutes,
      triggerThreshold: groupConfig.triggerThreshold ?? config.defaultTriggerThreshold,
      aiThreshold: groupConfig.aiThreshold ?? config.defaultAiThreshold,
      checkProbability: groupConfig.checkProbability ?? config.defaultCheckProbability,
      // Others remain as is (they have defaults in Schema or are required)
    }

    if (config.debug && groupConfig.detailedLog) {
       logger.debug(`[Group: ${groupId}] Effective Config: Mute=${effectiveConfig.muteMinutes}m, Trigger=${effectiveConfig.triggerThreshold}, AI=${effectiveConfig.aiThreshold}, Prob=${effectiveConfig.checkProbability}`)
    }

    // --- Check Probability ---
    if (effectiveConfig.checkProbability < 1.0) {
      const rand = Math.random()
      if (rand > effectiveConfig.checkProbability) {
        if (config.debug && groupConfig.detailedLog) {
          logger.debug(`[Group: ${groupId}] [User: ${userId}] Skipped by probability (Rand=${rand.toFixed(2)} > Prob=${effectiveConfig.checkProbability}).`)
        }
        return
      }
    }

    // Throttle
    const throttleKey = `${groupId}-${userId}`
    const now = Date.now()
    if (messageThrottle.has(throttleKey) && now - messageThrottle.get(throttleKey)! < THROTTLE_LIMIT) {
      if (config.debug) {
        logger.debug(`[Group: ${groupId}] [User: ${userId}] Throttled.`)
      }
      return
    }
    messageThrottle.set(throttleKey, now)

    // Whitelist
    if (whitelistService.isWhitelisted(groupId, userId)) {
      if (config.debug) {
        logger.debug(`[Group: ${groupId}] [User: ${userId}] Whitelisted.`)
      }
      return
    }

    // Detection
    // Pass effectiveConfig which contains the merged thresholds
    const result = await detector.check(session.content!, groupId, userId, effectiveConfig)

    // Store message in history (after check, or before? If before, current msg is in history for verification)
    // The requirement says "Output user recent ? messages".
    // If we verify, we usually exclude the current message from "history" part of prompt and put it in "current".
    // So we add to history AFTER check is done (or if safe).
    // Actually, for "recent context", we should store every text message.
    await history.add(groupId, userId, session.content!, messageId)

    if (!result.detected) {
      if (config.debug && groupConfig.detailedLog) logger.debug(`[DEBUG] No violation detected in group ${groupId}.`)
      return
    }

    // --- Violation Detected ---
    const words = result.detectedWords || []
    logger.warn(`[VIOLATION] [Group: ${groupId}] [User: ${userId}] Words: ${words.join(', ')}`)

    // 1. Recall Message
    if (messageId) {
      try {
        if (session.bot.deleteMessage) {
          await session.bot.deleteMessage(groupId, messageId)
        } else {
          // Fallback for OneBot or non-standard adapters
          const bot = session.bot as any
          if (bot.delete_msg) {
            // @ts-ignore
            await bot.delete_msg({ group_id: groupId, message_id: messageId })
          } else {
             logger.warn('[Recall Failed] No delete method available.')
          }
        }
        if (config.debug) logger.debug(`[Group: ${groupId}] Message ${messageId} recalled.`)
      } catch (err) {
        logger.error(`[Recall Failed] Group: ${groupId}, Msg: ${messageId}, Error: ${err}`)
      }
    }

    // 2. Track & Punish Calculation
    const recordKey = `${groupId}-${userId}`
    // 'now' variable is already declared above at line 262
    const triggerWindow = (groupConfig.triggerWindowMinutes ?? 5) * Time.minute
    
    let record = userRecords.get(recordKey)
    if (!record) {
      record = { count: 1, firstTime: now }
      userRecords.set(recordKey, record)
    } else {
      if (now - record.firstTime > triggerWindow) {
        if (config.debug) logger.debug(`[Group: ${groupId}] [User: ${userId}] Window expired. Reset count.`)
        record.count = 1
        record.firstTime = now
      } else {
        record.count++
      }
    }

    const currentCount = record.count
    const maxCount = effectiveConfig.triggerThreshold
    const remaining = Math.max(0, maxCount - currentCount)
    const muteMinutes = effectiveConfig.muteMinutes

    logger.info(`[COUNT] [Group: ${groupId}] [User: ${userId}] ${currentCount}/${maxCount}`)

    // 3. Send Warning
    if (result.censoredText) {
      try {
        const showWord = groupConfig.showCensoredWord ?? config.defaultShowCensoredWord ?? true
        const wordDisplay = showWord ? result.censoredText : '***'
        
        let warningMsg = ''
        if (groupConfig.warningTemplate) {
          // Custom Template
          warningMsg = groupConfig.warningTemplate
            .replace(/{at}/g, h.at(userId).toString())
            .replace(/{userId}/g, userId)
            .replace(/{nick}/g, session.username || userId)
            .replace(/{words}/g, wordDisplay!)
            .replace(/{count}/g, String(currentCount))
            .replace(/{maxCount}/g, String(maxCount))
            .replace(/{muteMinutes}/g, String(muteMinutes))
        } else {
          // Default Template
          const detailMsg = session.text('commands.temporaryban.messages.violation_detail', [
            wordDisplay, 
            currentCount, 
            maxCount, 
            remaining, 
            muteMinutes
          ])
          warningMsg = h.at(userId) + ' ' + detailMsg
        }
        
        await session.send(warningMsg)
      } catch (err) {
        logger.error(`[Send Failed] Group: ${groupId}, Error: ${err}`)
      }
    }

    // 4. Record Violation (Mail)
    await mailer.recordViolation(userId, groupId, words, session.content!)

    // 5. Mute Execution
    if (currentCount >= maxCount) {
      const muteSeconds = Math.floor(muteMinutes * 60)
      try {
        if (session.bot.muteGuildMember) {
           // Ensure parameters are correct: guildId, userId, milliseconds
           await session.bot.muteGuildMember(groupId, userId, muteSeconds * 1000)
        } else {
           const bot = session.bot as any
           if (bot.set_group_ban) {
             // OneBot legacy: group_id, user_id, duration(seconds)
             // @ts-ignore
             await bot.set_group_ban(groupId, userId, muteSeconds)
           } else {
             logger.warn('[Mute Failed] No mute method available.')
           }
        }
        logger.success(`[MUTE] [Group: ${groupId}] [User: ${userId}] Duration: ${muteSeconds}s`)
        userRecords.delete(recordKey)
      } catch (err) {
        logger.error(`[Mute Failed] Group: ${groupId}, User: ${userId}, Error: ${err}`)
      }
    }
  })
}
