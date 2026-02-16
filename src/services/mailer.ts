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
  private ctx: Context
  private logger: Logger
  private config: Config

  constructor(ctx: Context, config: Config) {
    this.ctx = ctx
    this.config = config
    this.logger = new Logger('temporaryban:mailer')
    
    // Start periodic task if summary interval is set
    if (this.config.smtp?.summaryIntervalDays && this.config.smtp.summaryIntervalDays > 0) {
      // Check every hour if it's time to send (this is a simplified scheduler)
      ctx.setInterval(() => {
        if (this.config.smtp) {
          this.sendSummaryReport(this.config.smtp.summaryIntervalDays * 24)
        }
      }, this.config.smtp.summaryIntervalDays * 24 * 60 * 60 * 1000)
    }
  }

  async recordViolation(userId: string, groupId: string, words: string[], content: string) {
    if (!this.config.smtp) return

    // If summary interval is 0, send immediately (legacy mode)
    if (this.config.smtp.summaryIntervalDays === 0) {
      await this.sendImmediate(userId, groupId, words, content)
      return
    }

    // Otherwise, record it to Database
    try {
      await this.ctx.database.create('temporaryban_violations', {
        userId,
        groupId,
        words,
        content,
        timestamp: new Date()
      })
      this.logger.debug(`Violation recorded for user ${userId}.`)
    } catch (err) {
      this.logger.error(`Failed to record violation to DB: ${err}`)
    }
  }

  // Old method for immediate sending
  private async sendImmediate(userId: string, groupId: string, words: string[], content: string) {
    if (!this.config.smtp?.host || !this.config.smtp?.receivers?.length) return

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
    if (!this.config.smtp?.host || !this.config.smtp?.receivers?.length) {
      return { success: false, error: 'smtp_not_configured' }
    }

    const now = new Date()
    const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000)
    
    // Filter records within the time window from Database
    let targetRecords: any[] = []
    try {
      targetRecords = await this.ctx.database.get('temporaryban_violations', {
        timestamp: { $gte: cutoff }
      })
    } catch (err) {
      this.logger.error(`Failed to fetch violations from DB: ${err}`)
      return { success: false, error: 'db_error' }
    }
    
    if (targetRecords.length === 0) {
      return { success: true, count: 0 }
    }

    const transporter = this.createTransporter()
    
    // Generate HTML Table
    const tableRows = targetRecords.map((r, index) => `
      <tr style="border-bottom: 1px solid #eee; background-color: ${index % 2 === 0 ? '#ffffff' : '#fcfcfc'};">
        <td style="padding: 12px 8px; color: #666; font-size: 13px;">${r.timestamp.toLocaleString()}</td>
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

  private async cleanupOldRecords(days: number) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    try {
      await this.ctx.database.remove('temporaryban_violations', {
        timestamp: { $lt: cutoff }
      })
    } catch (err) {
      this.logger.error(`Failed to cleanup old records: ${err}`)
    }
  }

  private createTransporter() {
    if (!this.config.smtp) {
      throw new Error('SMTP configuration is missing')
    }
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
