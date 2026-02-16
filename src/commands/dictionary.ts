import { Context } from 'koishi'
import { Config } from '../config'
import { DetectorService } from '../services/detector'
import { checkPermission } from '../utils/permission'

export function registerDictionaryCommands(ctx: Context, config: Config, detector: DetectorService) {
  const cmd = ctx.command('temporaryban')

  // 2. Add Word (Group Admin)
  cmd.subcommand('.add <word:string>')
    .action(async ({ session }, word) => {
      if (!session) return
      if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
      if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')
      if (!word) return session.text('commands.temporaryban.messages.specify_word')
      
      const groupConfig = config.groups.find(g => g.groupId === session.guildId)
      if (!groupConfig) return session.text('commands.temporaryban.messages.group_not_configured')
      
      const success = await detector.addWord(session.guildId, word)
      if (!success) return session.text('commands.temporaryban.messages.word_exists')
      
      return session.text('commands.temporaryban.messages.word_added', [word])
    })

  // 3. Remove Word
  cmd.subcommand('.remove <word:string>')
    .action(async ({ session }, word) => {
       if (!session) return
       if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
       if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')
       if (!word) return session.text('commands.temporaryban.messages.specify_word')

       const groupConfig = config.groups.find(g => g.groupId === session.guildId)
       if (!groupConfig) return session.text('commands.temporaryban.messages.group_not_configured')

       const success = await detector.removeWord(session.guildId, word)
       if (!success) return session.text('commands.temporaryban.messages.word_not_found')
       
       return session.text('commands.temporaryban.messages.word_removed', [word])
    })

  // 4. List Words
  cmd.subcommand('.list')
    .action(async ({ session }) => { 
       if (!session) return
       if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
       if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')
       
       const groupConfig = config.groups.find(g => g.groupId === session.guildId)
       if (!groupConfig) return session.text('commands.temporaryban.messages.group_not_configured')
       
       const items = detector.getWords(session.guildId)
       if (items.length === 0) return session.text('commands.temporaryban.messages.no_forbidden_words')
       return session.text('commands.temporaryban.messages.forbidden_words_list', [items.length, items.map(i => i.word).join(', ')])
    })
}
