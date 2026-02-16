import { Context } from 'koishi'
import { Config } from '../config'
import { DetectorService } from '../services/detector'
import { checkPermission } from '../utils/permission'

export function registerCheckCommands(ctx: Context, config: Config, detector: DetectorService) {
  const cmd = ctx.command('temporaryban')

  // 9. Check
  cmd.subcommand('.check <text:text>')
    .action(async ({ session }, text) => {
       if (!session) return
       if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
       if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')
       if (!text) return session.text('commands.temporaryban.messages.specify_text')
       
       const groupConfig = config.groups.find(g => g.groupId === session.guildId)
       if (!groupConfig) return session.text('commands.temporaryban.messages.group_not_configured')
       
       const res = await detector.check(text, session.guildId, groupConfig.detectionMethod)
       if (res.detected) {
         return session.text('commands.temporaryban.messages.detected', [res.detectedWords?.join(', ')])
       }
       return session.text('commands.temporaryban.messages.safe')
    })
}
