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
    for (const group of this.config.groups) {
      if (!group.groupId) continue
      const parsed = this.parseLocalDict(group.localBadWordDict)
      this.localDictCache.set(group.groupId, parsed)
      if (group.detailedLog) {
        this.logger.debug(`Loaded ${parsed.length} local words for group ${group.groupId}`)
      }
    }
  }

  private parseLocalDict(dictStr: string): BadWordItem[] {
    const result: BadWordItem[] = []
    if (!dictStr || !dictStr.trim()) return result
    
    // Support simple word list (comma separated) or strict format (1.code)(2.word)
    if (dictStr.includes('(') && dictStr.includes(')')) {
      const reg = /\(([^.]+)\.(.+?)\)/g
      let match
      while ((match = reg.exec(dictStr)) !== null) {
        result.push({ code: match[1].trim(), word: match[2].trim() })
      }
    } else {
      // Fallback: treat the whole string as a single word or comma/newline-separated list if needed
      // For now, let's stick to the user's requirement but allow simple words if they don't match the format
      const words = dictStr.split(/[,，\r\n]/).map(w => w.trim()).filter(w => w)
      words.forEach((w, index) => {
        result.push({ code: String(index + 1), word: w })
      })
    }
    
    return result
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
