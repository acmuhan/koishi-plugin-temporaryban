import { Context } from 'koishi'
import { Config } from '../config'
import { MailerService } from '../services/mailer'

export function registerAdminCommands(ctx: Context, config: Config, mailer: MailerService) {
  const cmd = ctx.command('temporaryban')

  cmd.subcommand('.report')
    .action(async ({ session }) => {
      if (!session?.userId || !config.adminList?.includes(session.userId)) {
        return session?.text('commands.temporaryban.messages.global_admin_only')
      }
      const result = await mailer.sendSummaryReport(24)
      if (result.success) {
        if (result.count === 0) return session?.text('commands.temporaryban.messages.no_violations')
        return session?.text('commands.temporaryban.messages.report_sent', [result.receivers, result.count])
      } else {
        if (result.error === 'smtp_not_configured') return session?.text('commands.temporaryban.messages.smtp_not_configured')
        return session?.text('commands.temporaryban.messages.report_failed', [result.error])
      }
    })
}
