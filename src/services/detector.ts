import { Context, Logger } from 'koishi'
import { Config, BadWordItem } from '../config'
import * as crypto from 'crypto'
import { SYSTEM_PROMPT } from '../utils/prompt'
import { HistoryService } from './history'

export interface CheckResult {
  detected: boolean
  censoredText?: string
  detectedWords?: string[]
}

interface AIResponse {
  isAbuse: boolean
  type: string
  level: number
  wordIdx: [number, number]
  sentence: string
}

export class DetectorService {
  private ctx: Context
  private config: Config
  private logger: Logger
  private localDictCache: Map<string, BadWordItem[]> = new Map()
  private ignoredWordsCache: Map<string, Set<string>> = new Map() // groupId -> Set<word>
  private history: HistoryService

  constructor(ctx: Context, config: Config, history: HistoryService) {
    this.ctx = ctx
    this.config = config
    this.history = history
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
    
    // 3. Load Ignored Words
    const allIgnored = await this.ctx.database.get('temporaryban_ignored_words', {})
    this.ignoredWordsCache.clear()
    for (const item of allIgnored) {
      if (!this.ignoredWordsCache.has(item.groupId)) {
        this.ignoredWordsCache.set(item.groupId, new Set())
      }
      this.ignoredWordsCache.get(item.groupId)?.add(item.word)
    }

    this.logger.info(`Loaded bad words for ${map.size} groups from database.`)
    this.logger.info(`Loaded ignored words for ${this.ignoredWordsCache.size} groups.`)
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

  public async addIgnoredWord(groupId: string, word: string): Promise<boolean> {
    const exists = await this.ctx.database.get('temporaryban_ignored_words', { groupId, word })
    if (exists.length > 0) return false
    
    await this.ctx.database.create('temporaryban_ignored_words', {
      groupId,
      word,
      createdAt: new Date()
    })
    
    if (!this.ignoredWordsCache.has(groupId)) {
      this.ignoredWordsCache.set(groupId, new Set())
    }
    this.ignoredWordsCache.get(groupId)?.add(word)
    
    return true
  }

  public async removeIgnoredWord(groupId: string, word: string): Promise<boolean> {
    const result = await this.ctx.database.remove('temporaryban_ignored_words', { groupId, word })
    if (result.matched === 0) return false
    
    if (this.ignoredWordsCache.has(groupId)) {
      this.ignoredWordsCache.get(groupId)?.delete(word)
    }
    
    return true
  }

  public getIgnoredWords(groupId: string): string[] {
    return Array.from(this.ignoredWordsCache.get(groupId) || [])
  }

  public isIgnored(groupId: string, word: string): boolean {
    const ignoredSet = this.ignoredWordsCache.get(groupId)
    if (!ignoredSet || ignoredSet.size === 0) return false
    return ignoredSet.has(word)
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

  async check(content: string, groupId: string, userId: string, groupConfig: any): Promise<CheckResult> {
    const methods = groupConfig.detectionMethods || ['local']
    let initialDetection: CheckResult = { detected: false }
    let hitMethod = ''

    if (this.config.debug && groupConfig.detailedLog) {
      this.logger.debug(`[Check] Group: ${groupId}, User: ${userId}, Methods: ${methods.join(',')}`)
    }

    // 1. Initial Check (Parallel or Sequential)
    // We check in priority order: Local -> API -> Cloud -> AI
    // If Smart Verification is ON, we stop at Local/API hit and verify with AI.
    
    // Check Local
    if (methods.includes('local')) {
      const res = this.checkWithLocal(content, groupId)
      if (res.detected) {
        if (this.config.debug && groupConfig.detailedLog) this.logger.debug(`[Check] Local hit: ${res.detectedWords?.join(',')}`)
        initialDetection = res
        hitMethod = 'local'
      }
    }

    // Check API (if local didn't hit or we want to check all? Let's check until first hit for efficiency unless we need all)
    // User wants "multiple options", implying potentially multiple checks.
    // But for "Smart Verification", if Local hits, we verify.
    if (!initialDetection.detected && methods.includes('api')) {
      const res = await this.checkWithApi(content)
      if (res.detected) {
        if (this.config.debug && groupConfig.detailedLog) this.logger.debug(`[Check] API hit: ${res.detectedWords?.join(',')}`)
        initialDetection = res
        hitMethod = 'api'
      }
    }

    // Cloud Checks
    if (!initialDetection.detected) {
      if (methods.includes('baidu')) {
        const res = await this.checkWithBaidu(content)
        if (res.detected) { initialDetection = res; hitMethod = 'baidu' }
      } else if (methods.includes('aliyun')) {
        const res = await this.checkWithAliyun(content)
        if (res.detected) { initialDetection = res; hitMethod = 'aliyun' }
      } else if (methods.includes('tencent')) {
        const res = await this.checkWithTencent(content)
        if (res.detected) { initialDetection = res; hitMethod = 'tencent' }
      }
    }

    // AI Check (Direct usage, not verification)
    if (!initialDetection.detected && methods.includes('ai')) {
      // If AI is used as a primary method, we just call it with current content
      const res = await this.checkWithAI(content, groupConfig.aiThreshold)
      if (res.detected) {
        if (this.config.debug && groupConfig.detailedLog) this.logger.debug(`[Check] AI hit.`)
        initialDetection = res
        hitMethod = 'ai'
      }
    }

    // 2. Smart Verification Logic
    if (initialDetection.detected && groupConfig.smartVerification && methods.includes('ai')) {
      // Only verify if hit came from non-AI methods (Local/API/Cloud)
      if (hitMethod !== 'ai') {
        this.logger.info(`[Smart Verification] Triggered by ${hitMethod}. Verifying with AI...`)
        
        // Fetch Context
        const history = await this.history.get(groupId, userId, groupConfig.contextMsgCount || 3)
        // Construct Contextual Prompt
        let contextPrompt = ''
        if (history.length > 0) {
          contextPrompt += '[History]\n'
          history.forEach(msg => {
            contextPrompt += `Content: ${msg.content}\n`
          })
        }
        contextPrompt += `[Current]\nContent: ${content}`
        
        // Verify
        const aiRes = await this.checkWithAI(contextPrompt, groupConfig.aiThreshold)
        
        if (aiRes.detected) {
          this.logger.info(`[Smart Verification] Confirmed violation.`)
          initialDetection = aiRes // Update result with AI confirmation
        } else {
          this.logger.info(`[Smart Verification] False positive dismissed by AI.`)
          return { detected: false } // AI overrides as safe
        }
      }
    }

    // 3. Ignored Words Filter (Whitelist)
    if (initialDetection.detected && initialDetection.detectedWords) {
      const filteredWords = initialDetection.detectedWords.filter(w => !this.isIgnored(groupId, w))
      
      if (filteredWords.length === 0) {
        if (this.config.debug && groupConfig.detailedLog) {
          this.logger.debug(`[Check] Ignored: All detected words are in whitelist. (${initialDetection.detectedWords.join(', ')})`)
        }
        return { detected: false }
      }
      
      // Update with filtered words
      initialDetection.detectedWords = filteredWords
    }

    return initialDetection
  }

  // --- OpenAI / SiliconFlow ---
  private async checkWithAI(content: string, threshold: number = 0.6): Promise<CheckResult> {
    if (!this.config.openai?.apiKey) {
      this.logger.warn('OpenAI/SiliconFlow API Key is missing.')
      return { detected: false }
    }

    try {
      const response = await this.ctx.http.post(`${this.config.openai.baseUrl}/chat/completions`, {
        model: this.config.openai.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: content }
        ],
        stream: false,
        response_format: { type: 'json_object' }
      }, {
        headers: {
          'Authorization': `Bearer ${this.config.openai.apiKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (this.config.debug) {
        this.logger.debug(`[AI Response] ${JSON.stringify(response)}`)
      }

      const choice = response.choices?.[0]
      if (!choice || !choice.message?.content) {
        this.logger.warn('AI returned empty response.')
        return { detected: false }
      }

      const contentStr = choice.message.content.trim()
      const jsonStr = contentStr.replace(/^```json\s*/, '').replace(/\s*```$/, '')
      
      let result: AIResponse
      try {
        result = JSON.parse(jsonStr)
      } catch (e) {
        this.logger.error(`Failed to parse AI JSON response: ${contentStr}`, e)
        return { detected: false }
      }

      // Check Threshold
      if (result.isAbuse && result.level >= threshold) {
        return {
          detected: true,
          censoredText: result.sentence,
          detectedWords: [result.type, `Level:${result.level}`]
        }
      }

      return { detected: false }
    } catch (err) {
      this.logger.error(`AI Check Failed: ${err}`)
      return { detected: false }
    }
  }

  // --- Baidu Cloud ---
  private async checkWithBaidu(content: string): Promise<CheckResult> {
    if (!this.config.baidu?.apiKey || !this.config.baidu?.secretKey) {
      this.logger.warn('Baidu API Key or Secret Key is missing.')
      return { detected: false }
    }

    try {
      // 1. Get Access Token (Ideally should cache this)
      // For simplicity in this iteration, we fetch it every time or rely on simple caching if we had a state.
      // But let's fetch it for now as per user instruction "simplest implementation".
      // Optimization: In a real prod env, cache this token.
      
      const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${this.config.baidu.apiKey}&client_secret=${this.config.baidu.secretKey}`
      const tokenRes = await this.ctx.http.post(tokenUrl)
      if (!tokenRes.access_token) {
        this.logger.warn('Failed to get Baidu Access Token.')
        return { detected: false }
      }
      
      const accessToken = tokenRes.access_token
      
      // 2. Call Text Censor API
      const checkUrl = `https://aip.baidubce.com/rest/2.0/solution/v1/text_censor/v2/user_defined?access_token=${accessToken}`
      
      const response = await this.ctx.http.post(checkUrl, new URLSearchParams({
        text: content
      }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })

      if (this.config.debug) {
        this.logger.debug(`[Baidu Response] ${JSON.stringify(response)}`)
      }

      if (response.conclusionType === 2) { // 2 = 不合规
        const details = response.data?.map((d: any) => d.msg).join(', ') || '违规内容'
        return {
          detected: true,
          censoredText: '***',
          detectedWords: [details]
        }
      }
      
      return { detected: false }
    } catch (err) {
      this.logger.error(`Baidu Check Failed: ${err}`)
      return { detected: false }
    }
  }

  // --- Aliyun (Green 2.0 / Enhanced) ---
  private async checkWithAliyun(content: string): Promise<CheckResult> {
    const aliyunConfig = this.config.aliyun
    if (!aliyunConfig?.accessKeyId || !aliyunConfig?.accessKeySecret) {
      this.logger.warn('Aliyun AccessKey ID or Secret is missing.')
      return { detected: false }
    }

    const { accessKeyId, accessKeySecret, endpoint } = aliyunConfig

    // RPC Signature Implementation
    try {
      const params: any = {
        AccessKeyId: accessKeyId,
        Action: 'TextModeration',
        Format: 'JSON',
        RegionId: 'cn-shanghai',
        SignatureMethod: 'HMAC-SHA1',
        SignatureNonce: Math.random().toString(36).slice(2),
        SignatureVersion: '1.0',
        Timestamp: new Date().toISOString(),
        Version: '2022-03-02',
        Service: 'comment_detection',
        ServiceParameters: JSON.stringify({ content: content })
      }

      // Canonicalize
      const keys = Object.keys(params).sort()
      const canonicalizedQueryString = keys.map(key => {
        return encodeURIComponent(key) + '=' + encodeURIComponent(params[key])
      }).join('&')

      const stringToSign = 'POST' + '&' + encodeURIComponent('/') + '&' + encodeURIComponent(canonicalizedQueryString)
      
      // Sign
      const signature = crypto.createHmac('sha1', accessKeySecret + '&')
        .update(stringToSign)
        .digest('base64')
      
      params.Signature = signature

      // Request
      // Note: Aliyun RPC uses params in Body for POST usually, or Query. 
      // Documentation says "POST (RPC style)", Content-Type: application/x-www-form-urlencoded
      const response = await this.ctx.http.post(`https://${endpoint}`, new URLSearchParams(params), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })

      if (this.config.debug) {
        this.logger.debug(`[Aliyun Response] ${JSON.stringify(response)}`)
      }

      if (response.Code === 200 && response.Data?.Result) {
        const results = response.Data.Result
        for (const res of results) {
          if (res.Label !== 'normal') {
            return {
              detected: true,
              censoredText: '***',
              detectedWords: [res.Label]
            }
          }
        }
      }
      
      return { detected: false }
    } catch (err) {
      this.logger.error(`Aliyun Check Failed: ${err}`)
      return { detected: false }
    }
  }

  // --- Tencent Cloud (TMS) ---
  private async checkWithTencent(content: string): Promise<CheckResult> {
    const tencentConfig = this.config.tencent
    if (!tencentConfig?.secretId || !tencentConfig?.secretKey) {
      this.logger.warn('Tencent SecretId or SecretKey is missing.')
      return { detected: false }
    }

    const { secretId, secretKey, region } = tencentConfig

    try {
      const endpoint = 'tms.tencentcloudapi.com'
      const service = 'tms'
      const action = 'TextModeration'
      const version = '2020-12-29'
      const timestamp = Math.floor(Date.now() / 1000)
      const date = new Date(timestamp * 1000).toISOString().split('T')[0]
      
      const payload = {
        Content: Buffer.from(content).toString('base64'),
        BizType: 'default' // Or config
      }
      const payloadStr = JSON.stringify(payload)
      const hashedPayload = crypto.createHash('sha256').update(payloadStr).digest('hex')

      // 1. Canonical Request
      const canonicalHeaders = `content-type:application/json\nhost:${endpoint}\n`
      const signedHeaders = 'content-type;host'
      const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`

      // 2. String to Sign
      const algorithm = 'TC3-HMAC-SHA256'
      const credentialScope = `${date}/${service}/tc3_request`
      const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
      const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`

      // 3. Signature
      const kDate = crypto.createHmac('sha256', 'TC3' + secretKey).update(date).digest()
      const kService = crypto.createHmac('sha256', kDate).update(service).digest()
      const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest()
      const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')

      // 4. Authorization Header
      const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

      if (this.config.debug) {
        this.logger.debug(`[Tencent Request] URL: https://${endpoint}`)
        this.logger.debug(`[Tencent Request] Payload: ${payloadStr}`)
        this.logger.debug(`[Tencent Request] Headers: X-TC-Action=${action}, X-TC-Version=${version}, Authorization=${authorization}`)
      }

      const response = await this.ctx.http.post(`https://${endpoint}`, payload, {
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json',
          'Host': endpoint,
          'X-TC-Action': action,
          'X-TC-Version': version,
          'X-TC-Timestamp': timestamp.toString(),
          'X-TC-Region': region
        }
      })

      if (this.config.debug) {
        this.logger.debug(`[Tencent Response] ${JSON.stringify(response)}`)
      }

      if (response.Response && response.Response.Suggestion) {
        if (response.Response.Suggestion === 'Block' || response.Response.Suggestion === 'Review') {
           return {
             detected: true,
             censoredText: '***',
             detectedWords: [response.Response.Label]
           }
        }
      }
      
      return { detected: false }
    } catch (err) {
      this.logger.error(`Tencent Check Failed: ${err}`)
      return { detected: false }
    }
  }

  private async checkWithApi(content: string): Promise<CheckResult> {
    if (!this.config.api?.apiId || !this.config.api?.apiKey) {
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
