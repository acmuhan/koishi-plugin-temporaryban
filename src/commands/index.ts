import { Context } from 'koishi'
import { Config } from '../config'
import { DetectorService } from '../services/detector'
import { MailerService } from '../services/mailer'
import { UserRecord } from '../utils/types'

import { registerAdminCommands } from './admin'
import { registerDictionaryCommands } from './dictionary'
import { registerWhitelistCommands } from './whitelist'
import { registerStatsCommands } from './stats'
import { registerCheckCommands } from './check'

export function registerCommands(ctx: Context, config: Config, detector: DetectorService, mailer: MailerService, userRecords: Map<string, UserRecord>) {
  registerAdminCommands(ctx, config, mailer)
  registerDictionaryCommands(ctx, config, detector)
  registerWhitelistCommands(ctx, config)
  registerStatsCommands(ctx, config, userRecords)
  registerCheckCommands(ctx, config, detector)
}
