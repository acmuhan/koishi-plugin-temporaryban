import { Context, Schema, Session, Time, Logger, h } from 'koishi'
import { randomUUID } from 'crypto'
import * as nodemailer from 'nodemailer'

export const name = 'koishi-plugin-temporaryban'

// --- Logger ---
const logger = new Logger('temporaryban')

// --- Configuration Interfaces ---

export interface BadWordItem {
  code: string
  word: string
}

export interface WhitelistItem {
  userId: string
}

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  senderName: string
  senderEmail: string
  receivers: string[]
}

export interface ApiConfig {
  apiUrl: string
  apiId: string
  apiKey: string
}

export interface GroupConfig {
  id: string
  groupId: string
  enable: boolean
  detectionMethod: 'local' | 'api'
  
  // Local Dictionary
  localBadWordDict: string
  
  // Violation Settings
  whitelist: WhitelistItem[]
  triggerThreshold: number
  triggerWindowMinutes: number
  muteMinutes: number
}

export interface Config {
  // Global Settings
  smtp: SmtpConfig
  api: ApiConfig
  
  // Group Settings
  groups: GroupConfig[]
}

// --- Schema Definition ---

export const Config: Schema<Config> = Schema.object({
  smtp: Schema.object({
    host: Schema.string().description('SMTP Host').default('smtp.example.com'),
    port: Schema.number().description('SMTP Port').default(465),
    secure: Schema.boolean().description('Use SSL/TLS').default(true),
    user: Schema.string().description('SMTP User').default('user@example.com'),
    pass: Schema.string().role('secret').description('SMTP Password').default('password'),
    senderName: Schema.string().description('Sender Name').default('Koishi Bot'),
    senderEmail: Schema.string().description('Sender Email').default('bot@example.com'),
    receivers: Schema.array(String).description('Receiver Emails').role('table'),
  }).description('Email Notification Settings (SMTP)'),

  api: Schema.object({
    apiUrl: Schema.string().description('API URL').default('https://cn.apihz.cn/api/zici/mgc.php'),
    apiId: Schema.string().description('Developer ID').default(''),
    apiKey: Schema.string().role('secret').description('API Key').default(''),
  }).description('API Detection Settings (ApiHz)'),

  groups: Schema.array(
    Schema.object({
      id: Schema.string().hidden().default(''),
      groupId: Schema.string().description('Group ID').required(),
      enable: Schema.boolean().description('Enable Monitoring').default(true),
      detectionMethod: Schema.union([
        Schema.const('local').description('Local Dictionary'),
        Schema.const('api').description('Online API (ApiHz)'),
      ]).description('Detection Method').default('local'),
      
      localBadWordDict: Schema.string()
        .description('Local Dictionary (Format: (1.word1)(2.word2))')
        .default(''),
        
      whitelist: Schema.array(
        Schema.object({
          userId: Schema.string().description('User ID')
        })
      ).description('Whitelist Users').role('table'),
      
      triggerThreshold: Schema.number().description('Trigger Threshold (Count)').default(3).min(1),
      triggerWindowMinutes: Schema.number().description('Trigger Window (Minutes)').default(5).min(0.1),
      muteMinutes: Schema.number().description('Mute Duration (Minutes)').default(10).min(0.1),
    }).description('Group Configuration')
  ).description('Monitored Groups').role('list').default([])
}).description('Temporary Ban Plugin Configuration')

// --- Runtime State Interfaces ---

interface UserRecord {
  count: number
  firstTime: number
}

interface CheckResult {
  detected: boolean
  censoredText?: string
  detectedWords?: string[]
}

// --- Plugin Implementation ---

export function apply(ctx: Context, config: Config) {
  // Runtime state
  const parsedLocalDictCache = new Map<string, BadWordItem[]>()
  const userRecords = new Map<string, UserRecord>() // Key: groupId-userId
  const messageThrottle = new Map<string, number>()
  const THROTTLE_LIMIT = 500 // 500ms throttle

  // --- Helper Functions ---

  function parseLocalDict(dictStr: string): BadWordItem[] {
    const result: BadWordItem[] = []
    if (!dictStr || !dictStr.trim()) return result
    const reg = /\(([^.]+)\.(.+?)\)/g
    let match
    while ((match = reg.exec(dictStr)) !== null) {
      result.push({ code: match[1].trim(), word: match[2].trim() })
    }
    return result
  }

  function initCache() {
    parsedLocalDictCache.clear()
    for (const group of config.groups) {
      if (!group.groupId) continue
      const parsed = parseLocalDict(group.localBadWordDict)
      parsedLocalDictCache.set(group.groupId, parsed)
    }
  }

  // API Detection
  async function checkWithApi(content: string): Promise<CheckResult> {
    if (!config.api.apiId || !config.api.apiKey) {
      logger.warn('API ID or Key is missing. Skipping API detection.')
      return { detected: false }
    }

    try {
      // Using POST as recommended
      const response = await ctx.http.post(config.api.apiUrl, {
        id: config.api.apiId,
        key: config.api.apiKey,
        words: content,
        replacetype: 1, // Return replaced text
        mgctype: 1,     // Return detected words list
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })

      // API returns JSON
      // Success: { code: 200, jcstatus: 1, replacewords: "...", mgcwords: "..." }
      // No violation: { code: 200, jcstatus: 0, ... }
      
      if (response && response.code === 200) {
        if (response.jcstatus === 1) {
          const words = response.mgcwords ? response.mgcwords.split(',') : []
          return {
            detected: true,
            censoredText: response.replacewords,
            detectedWords: words
          }
        }
        return { detected: false }
      } else {
        logger.warn(`API Error: ${JSON.stringify(response)}`)
        return { detected: false }
      }
    } catch (err) {
      logger.error(`API Request Failed: ${err}`)
      return { detected: false }
    }
  }

  // Local Detection
  function checkWithLocal(content: string, groupId: string): CheckResult {
    const badWords = parsedLocalDictCache.get(groupId) || []
    if (badWords.length === 0) return { detected: false }

    const detectedWords: string[] = []
    let censoredText = content
    let hasViolation = false

    for (const item of badWords) {
      if (content.includes(item.word)) {
        hasViolation = true
        detectedWords.push(item.word)
        // Simple replacement for local
        censoredText = censoredText.split(item.word).join('*'.repeat(item.word.length))
      }
    }

    if (hasViolation) {
      return {
        detected: true,
        censoredText,
        detectedWords
      }
    }
    return { detected: false }
  }

  // Email Notification
  async function sendEmail(userId: string, groupId: string, words: string[]) {
    if (!config.smtp.host || config.smtp.receivers.length === 0) return

    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure, // true for 465, false for other ports
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    })

    const mailOptions = {
      from: `"${config.smtp.senderName}" <${config.smtp.senderEmail}>`,
      to: config.smtp.receivers.join(','),
      subject: `[Koishi Security] Violation Detected in Group ${groupId}`,
      text: `User ${userId} triggered forbidden words in Group ${groupId}.\n\nDetected Words: ${words.join(', ')}\n\nTime: ${new Date().toLocaleString()}`,
      html: `
        <h2>Violation Detected</h2>
        <p><strong>Group ID:</strong> ${groupId}</p>
        <p><strong>User ID:</strong> ${userId}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Detected Words:</strong></p>
        <ul>
          ${words.map(w => `<li>${w}</li>`).join('')}
        </ul>
      `,
    }

    try {
      const info = await transporter.sendMail(mailOptions)
      logger.info(`Email sent: ${info.messageId}`)
    } catch (err) {
      logger.error(`Failed to send email: ${err}`)
    }
  }

  // --- Lifecycle ---

  ctx.on('ready', () => {
    initCache()
    logger.info('Plugin initialized.')
  })

  ctx.setInterval(() => {
    messageThrottle.clear()
  }, 60 * 1000)

  // --- Message Handler ---

  ctx.on('message', async (session: Session) => {
    // Basic Filtering
    if (
      session.type !== 'group' ||
      !session.content ||
      session.selfId === session.userId ||
      !session.guildId
    ) return

    const elements = session.elements || []
    if (!elements.some((el: any) => el.type === 'text')) return

    const groupId = session.guildId
    const userId = session.userId
    const messageId = session.messageId

    if (!userId) return

    // Config Check
    const groupConfig = config.groups.find(g => g.groupId === groupId)
    if (!groupConfig || !groupConfig.enable) return

    // Throttle
    const throttleKey = `${groupId}-${userId}`
    const now = Date.now()
    if (messageThrottle.has(throttleKey) && now - messageThrottle.get(throttleKey)! < THROTTLE_LIMIT) {
      return
    }
    messageThrottle.set(throttleKey, now)

    // Whitelist
    if (groupConfig.whitelist.some(w => w.userId === userId)) return

    // Detection
    let result: CheckResult = { detected: false }

    if (groupConfig.detectionMethod === 'api') {
      result = await checkWithApi(session.content!)
    } else {
      result = checkWithLocal(session.content!, groupId)
    }

    if (!result.detected) return

    // --- Violation Handling ---
    const words = result.detectedWords || []
    logger.warn(`Violation: Group ${groupId} User ${userId} Words: ${words.join(', ')}`)

    // 1. Recall Message
    if (messageId) {
      try {
        if (session.bot.deleteMessage) {
          await session.bot.deleteMessage(groupId, messageId)
        } else {
          // Fallback
          const bot = session.bot as any
          if (bot.delete_msg) {
            await bot.delete_msg({ group_id: groupId, message_id: messageId })
          }
        }
      } catch (err) {
        logger.error(`Recall failed: ${err}`)
      }
    }

    // 2. Send Censored Text
    if (result.censoredText) {
      try {
        await session.send(h.at(userId) + ' ' + result.censoredText)
      } catch (err) {
        logger.error(`Send message failed: ${err}`)
      }
    }

    // 3. Email Notification
    // Trigger on every violation
    await sendEmail(userId, groupId, words)

    // 4. Track & Punish
    const recordKey = `${groupId}-${userId}`
    let record = userRecords.get(recordKey)
    const triggerWindow = groupConfig.triggerWindowMinutes * Time.minute

    if (!record) {
      record = { count: 1, firstTime: now }
      userRecords.set(recordKey, record)
    } else {
      if (now - record.firstTime > triggerWindow) {
        record.count = 1
        record.firstTime = now
      } else {
        record.count++
      }
    }

    logger.info(`Violation Count: ${record.count}/${groupConfig.triggerThreshold}`)

    if (record.count >= groupConfig.triggerThreshold) {
      const muteSeconds = Math.floor(groupConfig.muteMinutes * 60)
      try {
        if (session.bot.muteGuildMember) {
           await session.bot.muteGuildMember(groupId, userId, muteSeconds * 1000)
        } else {
           const bot = session.bot as any
           if (bot.set_group_ban) {
             await bot.set_group_ban(groupId, userId, muteSeconds)
           }
        }
        logger.success(`Muted user ${userId}`)
        userRecords.delete(recordKey)
      } catch (err) {
        logger.error(`Mute failed: ${err}`)
      }
    }
  })
}
