import { Context } from 'koishi'
import { Config } from '../config'
import { checkPermission } from '../utils/permission'
import { WhitelistService } from '../services/whitelist'
import { DetectorService } from '../services/detector'

export function registerWhitelistCommands(ctx: Context, config: Config, whitelistService: WhitelistService, detector: DetectorService) {
  const cmd = ctx.command('temporaryban')

  // 5. Whitelist Add User
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

  // 6. Whitelist Remove User
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

  // 7. Whitelist Word Add
  cmd.subcommand('.whitelist.word.add <word:string>')
    .action(async ({ session }, word) => {
      if (!session) return
      if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
      if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')
      if (!word) return session.text('commands.temporaryban.messages.specify_word')

      const groupConfig = config.groups.find(g => g.groupId === session.guildId)
      if (!groupConfig) return session.text('commands.temporaryban.messages.group_not_configured')

      const success = await detector.addIgnoredWord(session.guildId, word)
      if (!success) return session.text('commands.temporaryban.messages.word_exists')

      return session.text('commands.temporaryban.messages.ignored_word_added', [word])
    })

  // 8. Whitelist Word Remove
  cmd.subcommand('.whitelist.word.remove <word:string>')
    .action(async ({ session }, word) => {
      if (!session) return
      if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
      if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')
      if (!word) return session.text('commands.temporaryban.messages.specify_word')

      const groupConfig = config.groups.find(g => g.groupId === session.guildId)
      if (!groupConfig) return session.text('commands.temporaryban.messages.group_not_configured')

      const success = await detector.removeIgnoredWord(session.guildId, word)
      if (!success) return session.text('commands.temporaryban.messages.word_not_found')

      return session.text('commands.temporaryban.messages.ignored_word_removed', [word])
    })

  // 9. Whitelist Word List
  cmd.subcommand('.whitelist.word.list')
    .action(async ({ session }) => {
      if (!session) return
      if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
      if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')

      const groupConfig = config.groups.find(g => g.groupId === session.guildId)
      if (!groupConfig) return session.text('commands.temporaryban.messages.group_not_configured')

      const items = detector.getIgnoredWords(session.guildId)
      if (items.length === 0) return session.text('commands.temporaryban.messages.no_ignored_words')
      return session.text('commands.temporaryban.messages.ignored_words_list', [items.length, items.join(', ')])
    })
}
