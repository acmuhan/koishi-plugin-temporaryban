import { Context, Session, Time, Logger, h } from 'koishi'
import { Config } from './config'
import { DetectorService } from './services/detector'
import { MailerService } from './services/mailer'

export * from './config'

export const name = 'koishi-plugin-temporaryban'

const logger = new Logger('temporaryban')

interface UserRecord {
  count: number
  firstTime: number
}

export function apply(ctx: Context, config: Config) {
  // --- Services ---
  const detector = new DetectorService(ctx, config)
  const mailer = new MailerService(ctx, config) // Pass context for baseDir access

  // --- Runtime State ---
  const userRecords = new Map<string, UserRecord>() // Key: groupId-userId
  const messageThrottle = new Map<string, number>()
  const THROTTLE_LIMIT = 500 // 500ms

  // --- Lifecycle ---
  ctx.on('ready', () => {
    logger.info('Plugin initialized.')
    logger.info(`Monitored groups: ${config.groups.length}`)
    if (config.debug) {
      logger.info('Debug mode enabled. Detailed logs will be output.')
    }
  })

  // Cleanup throttle periodically
  ctx.setInterval(() => {
    messageThrottle.clear()
  }, 60 * 1000)

  // --- Admin Command ---
  // We use a middleware or check in 'message' to avoid Koishi command system if desired,
  // but ctx.command is standard. To bypass permission system, we check config manually.
  ctx.command('banreport', 'Manually trigger violation report (Admin only)')
    .action(async ({ session }) => {
      if (!session?.userId) return
      
      // Check admin permission from config
      if (!config.adminList?.includes(session.userId)) {
        return // Silently ignore or return 'Permission denied'
      }

      // Send summary for last 24 hours
      const result = await mailer.sendSummaryReport(24)
      return result
    })

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
    if (groupConfig.whitelist.some(w => w.userId === userId)) {
      if (config.debug) {
        logger.debug(`[Group: ${groupId}] [User: ${userId}] Whitelisted.`)
      }
      return
    }

    // Detection
    const result = await detector.check(session.content!, groupId, groupConfig.detectionMethod)

    if (!result.detected) {
      if (config.debug) logger.debug(`[DEBUG] No violation detected in group ${groupId}.`)
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

    // 2. Send Censored Text (Modified format)
    if (result.censoredText) {
      try {
        // Format: "您触发了违禁词检测:违禁词:(censored_text)"
        const warningMsg = `您触发了违禁词检测:违禁词:(${result.censoredText})`
        await session.send(h.at(userId) + ' ' + warningMsg)
      } catch (err) {
        logger.error(`[Send Failed] Group: ${groupId}, Error: ${err}`)
      }
    }

    // 3. Record Violation (Email Notification Logic Changed)
    await mailer.recordViolation(userId, groupId, words, session.content!)

    // 4. Track & Punish
    const recordKey = `${groupId}-${userId}`
    let record = userRecords.get(recordKey)
    const triggerWindow = groupConfig.triggerWindowMinutes * Time.minute

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

    logger.info(`[COUNT] [Group: ${groupId}] [User: ${userId}] ${record.count}/${groupConfig.triggerThreshold}`)

    if (record.count >= groupConfig.triggerThreshold) {
      const muteSeconds = Math.floor(groupConfig.muteMinutes * 60)
      try {
        if (session.bot.muteGuildMember) {
           // Ensure parameters are correct: guildId, userId, milliseconds
           await session.bot.muteGuildMember(groupId, userId, muteSeconds * 1000)
        } else {
           const bot = session.bot as any
           if (bot.set_group_ban) {
             // OneBot legacy: group_id, user_id, duration(seconds)
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
