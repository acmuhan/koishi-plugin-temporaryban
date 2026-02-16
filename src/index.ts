import { Context, Session, Time, Logger, h } from 'koishi'
import { Config, BadWordTable } from './config'
import { DetectorService } from './services/detector'
import { MailerService } from './services/mailer'

export * from './config'

export const name = 'koishi-plugin-temporaryban'
export const inject = ['database']

declare module 'koishi' {
  interface Tables {
    temporaryban_badwords: BadWordTable
  }
}

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

  // --- Database Model ---
  ctx.model.extend('temporaryban_badwords', {
    id: 'unsigned',
    groupId: 'string',
    word: 'string',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
  })

  // --- Lifecycle ---
  ctx.on('ready', async () => {
    logger.info('Plugin initialized.')
    logger.info(`Monitored groups: ${config.groups.length}`)
    
    // Initialize detector with database data
    try {
      await detector.init()
    } catch (err) {
      logger.error('Failed to initialize detector:', err)
    }
    
    if (config.debug) {
      logger.info('Debug mode enabled. Detailed logs will be output.')
    }
  })

  // Cleanup throttle periodically
  ctx.setInterval(() => {
    messageThrottle.clear()
  }, 60 * 1000)

  // --- Admin Command ---
  const cmd = ctx.command('temporaryban', 'Temporary Ban Plugin Management')

  const checkPermission = (session: Session) => {
    if (!session?.userId) return false
    // 1. Global Admin
    if (config.adminList?.includes(session.userId)) return true
    // 2. Group Admin/Owner (Dynamic)
    const roles = session.author?.roles || []
    return roles.includes('admin') || roles.includes('owner')
  }

  // 1. Report (Global Admin Only)
  cmd.subcommand('.report', 'Manually trigger violation report (Global Admin only)')
    .action(async ({ session }) => {
      if (!session?.userId || !config.adminList?.includes(session.userId)) {
        return 'Permission denied. This command is for global admins only.'
      }
      const result = await mailer.sendSummaryReport(24)
      return result
    })

  // 2. Add Word (Group Admin)
  cmd.subcommand('.add <word:string>', 'Add a forbidden word to current group')
    .action(async ({ session }, word) => {
      if (!session) return
      if (!checkPermission(session)) return 'Permission denied.'
      if (!session.guildId) return 'This command must be used in a group.'
      if (!word) return 'Please specify a word.'
      
      const groupConfig = config.groups.find(g => g.groupId === session.guildId)
      if (!groupConfig) return 'This group is not configured for monitoring.'
      
      const success = await detector.addWord(session.guildId, word)
      if (!success) return 'Word already exists.'
      
      return `Added "${word}" to local dictionary.`
    })

  // 3. Remove Word
  cmd.subcommand('.remove <word:string>', 'Remove a forbidden word')
    .action(async ({ session }, word) => {
       if (!session) return
       if (!checkPermission(session)) return 'Permission denied.'
       if (!session.guildId) return 'This command must be used in a group.'
       if (!word) return 'Please specify a word.'

       const groupConfig = config.groups.find(g => g.groupId === session.guildId)
       if (!groupConfig) return 'This group is not configured.'

       const success = await detector.removeWord(session.guildId, word)
       if (!success) return 'Word not found.'
       
       return `Removed "${word}".`
    })

  // 4. List Words
  cmd.subcommand('.list', 'List forbidden words')
    .action(async ({ session }, word) => { // Added 'word' param just to match signature if needed, but not used. Koishi actions don't strictly require unused params.
       if (!session) return
       if (!checkPermission(session)) return 'Permission denied.'
       if (!session.guildId) return 'This command must be used in a group.'
       
       const groupConfig = config.groups.find(g => g.groupId === session.guildId)
       if (!groupConfig) return 'Not configured.'
       
       const items = detector.getWords(session.guildId)
       if (items.length === 0) return 'No forbidden words.'
       return `Forbidden words (${items.length}):\n${items.map(i => i.word).join(', ')}`
    })

  // 5. Whitelist Add
  cmd.subcommand('.whitelist.add <user:string>', 'Add user to whitelist')
    .action(async ({ session }, user) => {
       if (!session) return
       if (!checkPermission(session)) return 'Permission denied.'
       if (!session.guildId) return 'Group only.'
       if (!user) return 'Specify user ID.'
       
       const groupConfig = config.groups.find(g => g.groupId === session.guildId)
       if (!groupConfig) return 'Not configured.'
       
       if (groupConfig.whitelist.some(u => u.userId === user)) return 'Already whitelisted.'
       groupConfig.whitelist.push({ userId: user })
       try {
        await ctx.scope.update(config)
      } catch (e) { }
       return `User ${user} added to whitelist.`
    })

  // 6. Whitelist Remove
  cmd.subcommand('.whitelist.remove <user:string>', 'Remove user from whitelist')
    .action(async ({ session }, user) => {
       if (!session) return
       if (!checkPermission(session)) return 'Permission denied.'
       if (!session.guildId) return 'Group only.'
       
       const groupConfig = config.groups.find(g => g.groupId === session.guildId)
       if (!groupConfig) return 'Not configured.'
       
       const idx = groupConfig.whitelist.findIndex(u => u.userId === user)
       if (idx === -1) return 'Not in whitelist.'
       groupConfig.whitelist.splice(idx, 1)
       try {
        await ctx.scope.update(config)
      } catch (e) { }
       return `User ${user} removed from whitelist.`
    })

  // 7. Stats
  cmd.subcommand('.stats', 'View violation statistics')
    .action(async ({ session }) => {
       if (!session) return
       if (!checkPermission(session)) return 'Permission denied.'
       if (!session.guildId) return 'Group only.'
       
       const prefix = `${session.guildId}-`
       let count = 0
       let violators = 0
       for (const [key, val] of userRecords.entries()) {
         if (key.startsWith(prefix)) {
           violators++
           count += val.count
         }
       }
       return `Current Monitoring Stats (Active Window):\nViolators: ${violators}`
    })

  // 8. Clean
  cmd.subcommand('.clean <user:string>', 'Clean violation records for a user')
    .action(async ({ session }, user) => {
       if (!session) return
       if (!checkPermission(session)) return 'Permission denied.'
       if (!session.guildId) return 'Group only.'
       if (!user) return 'Specify user ID.'
       
       const key = `${session.guildId}-${user}`
       if (userRecords.delete(key)) {
         return `Records cleared for user ${user}.`
       }
       return `No active records for user ${user}.`
    })

  // 9. Check
  cmd.subcommand('.check <text:text>', 'Check if text contains forbidden words')
    .action(async ({ session }, text) => {
       if (!session) return
       if (!checkPermission(session)) return 'Permission denied.'
       if (!session.guildId) return 'Group only.'
       if (!text) return 'Specify text.'
       
       const groupConfig = config.groups.find(g => g.groupId === session.guildId)
       if (!groupConfig) return 'Not configured.'
       
       const res = await detector.check(text, session.guildId, groupConfig.detectionMethod)
       if (res.detected) {
         return `Detected: ${res.detectedWords?.join(', ')}`
       }
       return 'Safe.'
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
