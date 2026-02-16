import { Context } from 'koishi'
import { Config } from '../config'
import { checkPermission } from '../utils/permission'
import { WhitelistService } from '../services/whitelist'

export function registerInfoCommands(ctx: Context, config: Config, whitelistService: WhitelistService) {
  const cmd = ctx.command('temporaryban')

  // 12. Group Info
  cmd.subcommand('.info')
    .action(async ({ session }) => {
      if (!session) return
      if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
      if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')

      const groupConfig = config.groups.find(g => g.groupId === session.guildId)
      if (!groupConfig) return session.text('commands.temporaryban.messages.group_not_configured')

      const whitelistCount = whitelistService.getList(session.guildId).length
      
      const methods = groupConfig.detectionMethods.join(', ') || 'None'
      const smartVer = groupConfig.smartVerification ? 'ON' : 'OFF'
      
      return session.text('commands.temporaryban.messages.group_info', [
        session.guildId,
        groupConfig.enable ? 'Enabled' : 'Disabled',
        methods,
        smartVer,
        groupConfig.triggerThreshold,
        groupConfig.muteMinutes,
        whitelistCount
      ])
    })
}
