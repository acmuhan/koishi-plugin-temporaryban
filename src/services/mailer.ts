import { Logger, Context } from 'koishi'
import * as nodemailer from 'nodemailer'
import { Config } from '../config'
import * as fs from 'fs'
import * as path from 'path'

interface ViolationRecord {
  userId: string
  groupId: string
  words: string[]
  content: string
  timestamp: number
}

export class MailerService {
  private logger: Logger
  private config: Config
  private records: ViolationRecord[] = []
  private storagePath: string

  constructor(ctx: Context, config: Config) {
    this.config = config
    this.logger = new Logger('temporaryban:mailer')
    
    // Setup storage for persistence (simple JSON file)
    this.storagePath = path.resolve(ctx.baseDir, 'data', 'temporaryban_records.json')
    this.loadRecords()

    // Start periodic task if summary interval is set
    if (this.config.smtp.summaryIntervalDays > 0) {
      // Check every hour if it's time to send (this is a simplified scheduler)
      // For production, a more robust scheduler might be needed, but this works for now.
      // We send reports based on interval from the *last send time* or just accumulate.
      // Since we don't store "last sent time", we'll just run a check every day? 
      // Better: use setInterval for the configured days.
      ctx.setInterval(() => {
        this.sendSummaryReport(this.config.smtp.summaryIntervalDays * 24)
      }, this.config.smtp.summaryIntervalDays * 24 * 60 * 60 * 1000)
    }
  }

  private loadRecords() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = fs.readFileSync(this.storagePath, 'utf-8')
        this.records = JSON.parse(data)
      }
    } catch (err) {
      this.logger.warn(`Failed to load records: ${err}`)
      this.records = []
    }
  }

  private saveRecords() {
    try {
      const dir = path.dirname(this.storagePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(this.records, null, 2))
    } catch (err) {
      this.logger.error(`Failed to save records: ${err}`)
    }
  }

  async recordViolation(userId: string, groupId: string, words: string[], content: string) {
    // If summary interval is 0, send immediately (legacy mode)
    if (this.config.smtp.summaryIntervalDays === 0) {
      await this.sendImmediate(userId, groupId, words, content)
      return
    }

    // Otherwise, record it
    this.records.push({
      userId,
      groupId,
      words,
      content,
      timestamp: Date.now()
    })
    this.saveRecords()
    this.logger.debug(`Violation recorded for user ${userId}. Total pending: ${this.records.length}`)
  }

  // Old method for immediate sending
  private async sendImmediate(userId: string, groupId: string, words: string[], content: string) {
    if (!this.config.smtp.host || this.config.smtp.receivers.length === 0) return

    const transporter = this.createTransporter()
    const mailOptions = {
      from: `"${this.config.smtp.senderName}" <${this.config.smtp.senderEmail}>`,
      to: this.config.smtp.receivers.join(','),
      subject: `[Koishi Security] Violation Detected in Group ${groupId}`,
      text: `User ${userId} triggered forbidden words in Group ${groupId}.\n\nDetected Words: ${words.join(', ')}\n\nTime: ${new Date().toLocaleString()}`,
      html: `
        <h2>Violation Detected</h2>
        <p><strong>Group ID:</strong> ${groupId}</p>
        <p><strong>User ID:</strong> ${userId}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Detected Words:</strong> ${words.join(', ')}</p>
      `,
    }

    try {
      const info = await transporter.sendMail(mailOptions)
      this.logger.info(`Immediate email sent: ${info.messageId}`)
    } catch (err) {
      this.logger.error(`Failed to send immediate email: ${err}`)
    }
  }

  // New method for summary report
  async sendSummaryReport(hours: number): Promise<string> {
    if (!this.config.smtp.host || this.config.smtp.receivers.length === 0) {
      return 'SMTP not configured or no receivers.'
    }

    const now = Date.now()
    const cutoff = now - hours * 60 * 60 * 1000
    
    // Filter records within the time window
    const targetRecords = this.records.filter(r => r.timestamp >= cutoff)
    
    if (targetRecords.length === 0) {
      return 'No violations found in the specified period.'
    }

    const transporter = this.createTransporter()
    
    // Generate HTML Table
    const tableRows = targetRecords.map(r => `
      <tr>
        <td>${new Date(r.timestamp).toLocaleString()}</td>
        <td>${r.groupId}</td>
        <td>${r.userId}</td>
        <td>${r.words.join(', ')}</td>
        <td>${r.content}</td>
      </tr>
    `).join('')

    const html = `
      <h2>Violation Summary Report (Last ${hours} hours)</h2>
      <p>Total Violations: ${targetRecords.length}</p>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
        <thead>
          <tr>
            <th>Time</th>
            <th>Group</th>
            <th>User</th>
            <th>Words</th>
            <th>Content</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `

    const mailOptions = {
      from: `"${this.config.smtp.senderName}" <${this.config.smtp.senderEmail}>`,
      to: this.config.smtp.receivers.join(','),
      subject: `[Koishi Security] Violation Summary Report (${targetRecords.length} records)`,
      html: html
    }

    try {
      const info = await transporter.sendMail(mailOptions)
      this.logger.info(`Summary email sent: ${info.messageId}`)
      
      // Cleanup sent records from storage if this is an automatic periodic report
      // If it's a manual command (24h), we might NOT want to delete them yet?
      // User requirement: "每?天总计一次" (Total once every ? days) implies consumption.
      // "获取最近24h的违禁词屏蔽" (Get recent 24h) implies query.
      // Strategy: 
      // 1. Keep records for a longer period (e.g. 7 days) and clean up old ones separately.
      // 2. Do not delete records inside sendSummaryReport.
      
      this.cleanupOldRecords(7) // Keep 7 days history
      
      return `Report sent successfully to ${this.config.smtp.receivers.length} receivers. Count: ${targetRecords.length}`
    } catch (err) {
      this.logger.error(`Failed to send summary email: ${err}`)
      return `Failed to send email: ${err}`
    }
  }

  private cleanupOldRecords(days: number) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    const initialLen = this.records.length
    this.records = this.records.filter(r => r.timestamp >= cutoff)
    if (this.records.length !== initialLen) {
      this.saveRecords()
      this.logger.info(`Cleaned up ${initialLen - this.records.length} old records.`)
    }
  }

  private createTransporter() {
    return nodemailer.createTransport({
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      secure: this.config.smtp.secure,
      auth: {
        user: this.config.smtp.user,
        pass: this.config.smtp.pass,
      },
    })
  }
}
