import { Context } from 'koishi'
import { Config } from '../config'
import { checkPermission } from '../utils/permission'
import { WhitelistService } from '../services/whitelist'

export function registerWhitelistCommands(ctx: Context, config: Config, whitelistService: WhitelistService) {
  const cmd = ctx.command('temporaryban')

  // 5. Whitelist Add
  cmd.subcommand('.whitelist.add <user:string>')
    .action(async ({ session }, user) => {
       if (!session) return
       if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
       if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')
       if (!user) return session.text('commands.temporaryban.messages.specify_user_id')
       
       const groupConfig = config.groups.find(g => g.groupId === session.guildId)
       if (!groupConfig) return session.text('commands.temporaryban.messages.group_not_configured')
       
       const success = await whitelistService.add(session.guildId, user)
       if (!success) return session.text('commands.temporaryban.messages.already_whitelisted')
       
       return session.text('commands.temporaryban.messages.user_added_whitelist', [user])
    })

  // 6. Whitelist Remove
  cmd.subcommand('.whitelist.remove <user:string>')
    .action(async ({ session }, user) => {
       if (!session) return
       if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
       if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')
       
       const groupConfig = config.groups.find(g => g.groupId === session.guildId)
       if (!groupConfig) return session.text('commands.temporaryban.messages.group_not_configured')
       
       const success = await whitelistService.remove(session.guildId, user)
       if (!success) return session.text('commands.temporaryban.messages.not_in_whitelist')
       
       return session.text('commands.temporaryban.messages.user_removed_whitelist', [user])
    })
}
