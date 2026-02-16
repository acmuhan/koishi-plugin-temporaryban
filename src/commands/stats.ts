import { Context } from 'koishi'
import { Config } from '../config'
import { checkPermission } from '../utils/permission'
import { UserRecord } from '../utils/types'

export function registerStatsCommands(ctx: Context, config: Config, userRecords: Map<string, UserRecord>) {
  const cmd = ctx.command('temporaryban')

  // 7. Stats
  cmd.subcommand('.stats')
    .action(async ({ session }) => {
       if (!session) return
       if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
       if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')
       
       const prefix = `${session.guildId}-`
       let count = 0
       let violators = 0
       for (const [key, val] of userRecords.entries()) {
         if (key.startsWith(prefix)) {
           violators++
           count += val.count
         }
       }
       return session.text('commands.temporaryban.messages.stats_header', [violators])
    })

  // 8. Clean
  cmd.subcommand('.clean [user:string]')
    .option('all', '-a 清除本群所有违规记录')
    .action(async ({ session, options }, user) => {
       if (!session) return
       if (!checkPermission(session, config)) return session.text('commands.temporaryban.messages.permission_denied')
       if (!session.guildId) return session.text('commands.temporaryban.messages.group_only')
       
       // Bulk Clean
       if (options?.all) {
         const prefix = `${session.guildId}-`
         let removedCount = 0
         for (const key of userRecords.keys()) {
           if (key.startsWith(prefix)) {
             userRecords.delete(key)
             removedCount++
           }
         }
         return session.text('commands.temporaryban.messages.all_records_cleared', [removedCount])
       }

       if (!user) return session.text('commands.temporaryban.messages.specify_user_id')
       
       const key = `${session.guildId}-${user}`
       if (userRecords.delete(key)) {
         return session.text('commands.temporaryban.messages.records_cleared', [user])
       }
       return session.text('commands.temporaryban.messages.no_active_records', [user])
    })
}
