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
    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <h2 style="color: #d32f2f; border-bottom: 2px solid #d32f2f; padding-bottom: 10px; margin-top: 0;">⚠️ Violation Detected</h2>
        
        <div style="background-color: #fff5f5; padding: 15px; border-radius: 4px; margin-bottom: 20px; border-left: 4px solid #d32f2f;">
          <p style="margin: 5px 0; color: #333;"><strong>Group ID:</strong> ${groupId}</p>
          <p style="margin: 5px 0; color: #333;"><strong>User ID:</strong> ${userId}</p>
          <p style="margin: 5px 0; color: #333;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        </div>

        <div style="margin-bottom: 20px;">
          <h3 style="color: #444; font-size: 16px; margin-bottom: 10px;">Detected Words</h3>
          <div style="background-color: #f0f0f0; padding: 10px; border-radius: 4px; color: #d32f2f; font-weight: bold;">
            ${words.join(', ')}
          </div>
        </div>

        <div style="margin-bottom: 20px;">
          <h3 style="color: #444; font-size: 16px; margin-bottom: 10px;">Original Content</h3>
          <div style="background-color: #f9f9f9; padding: 10px; border-radius: 4px; color: #555; font-style: italic;">
            "${content}"
          </div>
        </div>
        
        <div style="margin-top: 30px; font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 10px;">
          Koishi Security System
        </div>
      </div>
    `

    const mailOptions = {
      from: `"${this.config.smtp.senderName}" <${this.config.smtp.senderEmail}>`,
      to: this.config.smtp.receivers.join(','),
      subject: `[Koishi Security] Violation Detected in Group ${groupId}`,
      text: `User ${userId} triggered forbidden words in Group ${groupId}.\n\nDetected Words: ${words.join(', ')}\n\nTime: ${new Date().toLocaleString()}`,
      html: html
    }

    try {
      const info = await transporter.sendMail(mailOptions)
      this.logger.info(`Immediate email sent: ${info.messageId}`)
    } catch (err) {
      this.logger.error(`Failed to send immediate email: ${err}`)
    }
  }

  // New method for summary report
  async sendSummaryReport(hours: number): Promise<{ success: boolean, count?: number, receivers?: number, error?: string }> {
    if (!this.config.smtp.host || this.config.smtp.receivers.length === 0) {
      return { success: false, error: 'smtp_not_configured' }
    }

    const now = Date.now()
    const cutoff = now - hours * 60 * 60 * 1000
    
    // Filter records within the time window
    const targetRecords = this.records.filter(r => r.timestamp >= cutoff)
    
    if (targetRecords.length === 0) {
      return { success: true, count: 0 }
    }

    const transporter = this.createTransporter()
    
    // Generate HTML Table
    const tableRows = targetRecords.map((r, index) => `
      <tr style="border-bottom: 1px solid #eee; background-color: ${index % 2 === 0 ? '#ffffff' : '#fcfcfc'};">
        <td style="padding: 12px 8px; color: #666; font-size: 13px;">${new Date(r.timestamp).toLocaleString()}</td>
        <td style="padding: 12px 8px; font-weight: 500;">${r.groupId}</td>
        <td style="padding: 12px 8px;">${r.userId}</td>
        <td style="padding: 12px 8px;"><span style="background-color: #ffebee; color: #c62828; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${r.words.join(', ')}</span></td>
        <td style="padding: 12px 8px; color: #444; max-width: 300px; word-break: break-all;">${r.content}</td>
      </tr>
    `).join('')

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1976d2; padding-bottom: 15px; margin-bottom: 20px;">
          <h2 style="color: #1976d2; margin: 0;">🛡️ Violation Summary Report</h2>
          <span style="background-color: #e3f2fd; color: #1976d2; padding: 5px 10px; border-radius: 15px; font-size: 14px; font-weight: bold;">Last ${hours} Hours</span>
        </div>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 6px; margin-bottom: 25px; display: flex; gap: 20px;">
          <div style="flex: 1;">
            <p style="margin: 0; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Total Violations</p>
            <p style="margin: 5px 0 0; font-size: 24px; font-weight: bold; color: #333;">${targetRecords.length}</p>
          </div>
          <div style="flex: 1;">
            <p style="margin: 0; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Groups Affected</p>
            <p style="margin: 5px 0 0; font-size: 24px; font-weight: bold; color: #333;">${new Set(targetRecords.map(r => r.groupId)).size}</p>
          </div>
        </div>
        
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; text-align: left;">
            <thead>
              <tr style="background-color: #f8f9fa; color: #555;">
                <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; font-weight: 600;">Time</th>
                <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; font-weight: 600;">Group</th>
                <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; font-weight: 600;">User</th>
                <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; font-weight: 600;">Words</th>
                <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; font-weight: 600;">Content</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
        
        <div style="margin-top: 30px; font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 15px;">
          Generated by Koishi Temporary Ban Plugin • ${new Date().toLocaleString()}
        </div>
      </div>
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
      
      return { success: true, count: targetRecords.length, receivers: this.config.smtp.receivers.length }
    } catch (err) {
      this.logger.error(`Failed to send summary email: ${err}`)
      return { success: false, error: String(err) }
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
