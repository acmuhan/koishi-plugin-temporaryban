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
import { registerHistoryCommands } from './history'
import { registerInfoCommands } from './info'
import { HistoryService } from '../services/history'
import { WhitelistService } from '../services/whitelist'

export function registerCommands(ctx: Context, config: Config, detector: DetectorService, mailer: MailerService, userRecords: Map<string, UserRecord>, history: HistoryService, whitelistService: WhitelistService) {
  registerAdminCommands(ctx, config, mailer)
  registerDictionaryCommands(ctx, config, detector)
  registerWhitelistCommands(ctx, config, whitelistService, detector)
  registerStatsCommands(ctx, config, userRecords)
  registerCheckCommands(ctx, config, detector)
  registerHistoryCommands(ctx, config, history)
  registerInfoCommands(ctx, config, whitelistService)
}
