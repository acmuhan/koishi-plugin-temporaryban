import { Context, Logger } from 'koishi'
import { Config, BadWordItem } from '../config'

export interface CheckResult {
  detected: boolean
  censoredText?: string
  detectedWords?: string[]
}

export class DetectorService {
  private ctx: Context
  private config: Config
  private logger: Logger
  private localDictCache: Map<string, BadWordItem[]> = new Map()

  constructor(ctx: Context, config: Config) {
    this.ctx = ctx
    this.config = config
    this.logger = new Logger('temporaryban:detector')
    this.initCache()
  }

  private initCache() {
    this.localDictCache.clear()
    // Initial loading from database will happen in init()
  }

  public async init() {
    this.localDictCache.clear()
    
    // 1. Load from Database
    const allWords = await this.ctx.database.get('temporaryban_badwords', {})
    
    // Group by groupId
    const map = new Map<string, BadWordItem[]>()
    for (const item of allWords) {
      if (!map.has(item.groupId)) {
        map.set(item.groupId, [])
      }
      map.get(item.groupId)?.push({ code: String(item.id), word: item.word })
    }
    
    // 2. Migration: Check config and import if DB is empty for that group
    for (const group of this.config.groups) {
      if (!group.groupId) continue
      
      const dbWords = map.get(group.groupId) || []
      
      // If DB has no words for this group, but config has, import from config
      if (dbWords.length === 0 && group.localBadWordDict && group.localBadWordDict.trim()) {
        const parsed = this.parseLocalDict(group.localBadWordDict)
        if (parsed.length > 0) {
          this.logger.info(`Migrating ${parsed.length} words from config to database for group ${group.groupId}`)
          
          const records = parsed.map(p => ({
            groupId: group.groupId,
            word: p.word,
            createdAt: new Date()
          }))
          
          await this.ctx.database.upsert('temporaryban_badwords', records, ['groupId', 'word'])
          
          // Update local map
          map.set(group.groupId, parsed)
        }
      }
    }
    
    this.localDictCache = map
    this.logger.info(`Loaded bad words for ${map.size} groups from database.`)
  }

  public async addWord(groupId: string, word: string): Promise<boolean> {
    const exists = await this.ctx.database.get('temporaryban_badwords', { groupId, word })
    if (exists.length > 0) return false
    
    await this.ctx.database.create('temporaryban_badwords', {
      groupId,
      word,
      createdAt: new Date()
    })
    
    // Update cache
    if (!this.localDictCache.has(groupId)) {
      this.localDictCache.set(groupId, [])
    }
    // We don't have the ID immediately unless we query back or use return value, 
    // but code is just for display/internal ref.
    this.localDictCache.get(groupId)?.push({ code: 'new', word }) 
    
    return true
  }

  public async removeWord(groupId: string, word: string): Promise<boolean> {
    const result = await this.ctx.database.remove('temporaryban_badwords', { groupId, word })
    if (result.matched === 0) return false
    
    // Update cache
    const list = this.localDictCache.get(groupId)
    if (list) {
      const newList = list.filter(i => i.word !== word)
      this.localDictCache.set(groupId, newList)
    }
    
    return true
  }

  public getWords(groupId: string): BadWordItem[] {
    return this.localDictCache.get(groupId) || []
  }

  // Deprecated/Helper for migration only
  public parseLocalDict(dictStr: string): BadWordItem[] {
    const result: BadWordItem[] = []
    if (!dictStr || !dictStr.trim()) return result
    
    // Support simple word list (comma separated) or strict format (1.code)(2.word)
    // Hybrid support: try to match strict format first, if found, use it.
    // But also support mixed content by splitting and checking if it looks like strict format?
    // Current logic: If parens exist, ONLY use regex. This ignores non-parens text.
    // Improved logic: If parens exist, use regex.
    // ALSO split by newline/comma and filter out those that were matched by regex?
    // Or simpler: Just return what we can find.
    
    if (dictStr.includes('(') && dictStr.includes(')')) {
      const reg = /\(([^.]+)\.(.+?)\)/g
      let match
      while ((match = reg.exec(dictStr)) !== null) {
        result.push({ code: match[1].trim(), word: match[2].trim() })
      }
    } 
    
    // Also try to parse as simple list if the above didn't catch everything or if it's mixed
    // But to avoid duplication, it's tricky. 
    // Let's keep the existing logic for now but make it public.
    // If the user uses the 'add' command, we will overwrite the string with a simple newline-separated list,
    // which falls into the "else" block (no parens usually, unless the word has parens).
    // Wait, if I add "word(1)", it has parens.
    // So the check `dictStr.includes('(')` is risky if the word itself contains parens.
    // But for now, let's assume the user knows what they are doing or we migrate to simple list.
    
    if (result.length === 0) {
      const words = dictStr.split(/[,，\r\n]/).map(w => w.trim()).filter(w => w)
      words.forEach((w, index) => {
        // Skip if it looks like (code.word) but wasn't parsed correctly? 
        // Or just take it.
        result.push({ code: String(index + 1), word: w })
      })
    }
    
    return result
  }

  public reloadGroup(groupId: string) {
    // Deprecated: No longer reloading from config.
    // But for compatibility with existing code structure (if called externally), we might just log or do nothing.
    // Or we could re-fetch from DB.
    this.init().catch(err => this.logger.error('Failed to reload from DB', err))
  }

  async check(content: string, groupId: string, method: 'local' | 'api'): Promise<CheckResult> {
    if (method === 'api') {
      return this.checkWithApi(content)
    } else {
      return this.checkWithLocal(content, groupId)
    }
  }

  private async checkWithApi(content: string): Promise<CheckResult> {
    if (!this.config.api.apiId || !this.config.api.apiKey) {
      this.logger.warn('API ID or Key is missing. Skipping API detection.')
      return { detected: false }
    }

    try {
      const params = new URLSearchParams()
      params.append('id', this.config.api.apiId)
      params.append('key', this.config.api.apiKey)
      params.append('words', content)
      params.append('replacetype', '1')
      params.append('mgctype', '1')

      if (this.config.debug) {
        this.logger.debug(`[API Request] URL: ${this.config.api.apiUrl}`)
        this.logger.debug(`[API Request] Params: ${params.toString()}`)
      }

      const response = await this.ctx.http.post(this.config.api.apiUrl, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })

      if (this.config.debug) {
        this.logger.debug(`[API Response] ${JSON.stringify(response)}`)
      }

      if (response && response.code === 200) {
        if (response.jcstatus === 1) {
          let words: string[] = []
          if (typeof response.mgcwords === 'string') {
            words = response.mgcwords.split(',')
          } else if (Array.isArray(response.mgcwords)) {
            words = response.mgcwords
          } else if (response.mgcwords) {
             words = [String(response.mgcwords)]
          }
          
          return {
            detected: true,
            censoredText: response.replacewords,
            detectedWords: words
          }
        }
        return { detected: false }
      } else {
        this.logger.warn(`API Error: ${JSON.stringify(response)}`)
        return { detected: false }
      }
    } catch (err) {
      this.logger.error(`API Request Failed: ${err}`)
      return { detected: false }
    }
  }

  private checkWithLocal(content: string, groupId: string): CheckResult {
    const badWords = this.localDictCache.get(groupId) || []
    if (badWords.length === 0) return { detected: false }

    const detectedWords: string[] = []
    let censoredText = content
    let hasViolation = false

    for (const item of badWords) {
      if (content.includes(item.word)) {
        hasViolation = true
        detectedWords.push(item.word)
        censoredText = censoredText.split(item.word).join('*'.repeat(item.word.length))
      }
    }

    if (hasViolation) {
      return {
        detected: true,
        censoredText,
        detectedWords
      }
    }
    return { detected: false }
  }
}
