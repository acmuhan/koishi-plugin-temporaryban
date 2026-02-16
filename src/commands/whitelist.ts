import { Context } from 'koishi'
import { Config } from '../config'
import { checkPermission } from '../utils/permission'
import { WhitelistService } from '../services/whitelist'
import { DetectorService } from '../services/detector'

export function registerWhitelistCommands(ctx: Context, config: Config, whitelistService: WhitelistService, detector: DetectorService) {
  const cmd = ctx.command('temporaryban')

  // --- Whitelist User Management ---
  const whitelistCmd = cmd.subcommand('.whitelist')

  // 10. Whitelist User List
  whitelistCmd.subcommand('.list')
    .action(async ({ session }) => {
      if (!session) return
      if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
      if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')

      const groupConfig = config.groups.find(g => g.groupId === session.guildId)
      if (!groupConfig) return session.text('commands.temporaryban.messages.group_not_configured')

      const items = whitelistService.getWhitelist(session.guildId)
      if (items.length === 0) return session.text('commands.temporaryban.messages.no_whitelist_users')
      return session.text('commands.temporaryban.messages.whitelist_users_list', [items.length, items.join(', ')])
    })

  // 5. Whitelist Add User
  whitelistCmd.subcommand('.add <user:string>')
    .action(async ({ session }, user) => {
       if (!session) return
       if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
       if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')
       
       if (!user) {
         await session.send(session.text('commands.temporaryban.messages.specify_user_id'))
         user = await session.prompt()
         if (!user) return
       }
       
       const groupConfig = config.groups.find(g => g.groupId === session.guildId)
       if (!groupConfig) return session.text('commands.temporaryban.messages.group_not_configured')
       
       // Support At-element (e.g. <at id="123"/>)
       if (user.includes('<at')) {
         const match = user.match(/id="([^"]+)"/)
         if (match) user = match[1]
       }

       const success = await whitelistService.add(session.guildId, user)
       if (!success) return session.text('commands.temporaryban.messages.already_whitelisted')
       
       return session.text('commands.temporaryban.messages.user_added_whitelist', [user])
    })

  // 6. Whitelist Remove User
  whitelistCmd.subcommand('.remove <user:string>')
    .action(async ({ session }, user) => {
       if (!session) return
       if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
       if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')
       
       if (!user) {
         await session.send(session.text('commands.temporaryban.messages.specify_user_id'))
         user = await session.prompt()
         if (!user) return
       }

       // Support At-element
       if (user.includes('<at')) {
         const match = user.match(/id="([^"]+)"/)
         if (match) user = match[1]
       }
       
       const groupConfig = config.groups.find(g => g.groupId === session.guildId)
       if (!groupConfig) return session.text('commands.temporaryban.messages.group_not_configured')
       
       const success = await whitelistService.remove(session.guildId, user)
       if (!success) return session.text('commands.temporaryban.messages.not_in_whitelist')
       
       return session.text('commands.temporaryban.messages.user_removed_whitelist', [user])
    })

  // --- Whitelist Word Management ---
  const wordCmd = whitelistCmd.subcommand('.word')

  // 7. Whitelist Word Add
  wordCmd.subcommand('.add <text:text>')
    .action(async ({ session }, text) => {
      if (!session) return
      if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
      if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')
      
      if (!text) {
        await session.send(session.text('commands.temporaryban.messages.specify_word'))
        text = await session.prompt()
        if (!text) return
      }

      const groupConfig = config.groups.find(g => g.groupId === session.guildId)
      if (!groupConfig) return session.text('commands.temporaryban.messages.group_not_configured')

      // Support batch add (comma or newline separated)
      const words = text.split(/[,，\n]/).map(w => w.trim()).filter(w => w)
      const added: string[] = []

      for (const w of words) {
        const success = await detector.addIgnoredWord(session.guildId, w)
        if (success) added.push(w)
      }

      if (added.length === 0) return session.text('commands.temporaryban.messages.word_exists')
      
      return session.text('commands.temporaryban.messages.ignored_word_added', [added.join(', ')])
    })

  // 8. Whitelist Word Remove
  wordCmd.subcommand('.remove <text:text>')
    .action(async ({ session }, text) => {
      if (!session) return
      if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
      if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')
      
      if (!text) {
        await session.send(session.text('commands.temporaryban.messages.specify_word'))
        text = await session.prompt()
        if (!text) return
      }

      const groupConfig = config.groups.find(g => g.groupId === session.guildId)
      if (!groupConfig) return session.text('commands.temporaryban.messages.group_not_configured')

      const words = text.split(/[,，\n]/).map(w => w.trim()).filter(w => w)
      const removed: string[] = []

      for (const w of words) {
        const success = await detector.removeIgnoredWord(session.guildId, w)
        if (success) removed.push(w)
      }

      if (removed.length === 0) return session.text('commands.temporaryban.messages.word_not_found')

      return session.text('commands.temporaryban.messages.ignored_word_removed', [removed.join(', ')])
    })

  // 9. Whitelist Word List
  wordCmd.subcommand('.list')
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
