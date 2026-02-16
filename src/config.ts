import { Schema } from 'koishi'

export interface BadWordItem {
  code: string
  word: string
}

export interface BadWordTable {
  id: number
  groupId: string
  word: string
  createdAt: Date
}

export interface WhitelistItem {
  userId: string
}

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  senderName: string
  senderEmail: string
  receivers: string[]
  summaryIntervalDays: number
}

export interface ApiConfig {
  apiUrl: string
  apiId: string
  apiKey: string
}

export interface GroupConfig {
  id: string
  groupId: string
  enable: boolean
  
  // 1. Detection Methods (Multi-select)
  detectionMethods: Array<'local' | 'api' | 'baidu' | 'aliyun' | 'tencent' | 'ai'>
  
  // 2. Smart Verification (Context Check)
  smartVerification: boolean // If true, local/api hit triggers AI context check
  contextMsgCount: number // How many recent messages to include

  // 3. AI Threshold
  aiThreshold?: number // 0.0 - 1.0

  // 4. Show Censored Word
  showCensoredWord?: boolean

  // Local Dictionary
  localBadWordDict: string
  
  // Violation Settings
  whitelist: WhitelistItem[]
  triggerThreshold?: number
  triggerWindowMinutes?: number
  muteMinutes?: number
  checkProbability?: number
  warningTemplate?: string // Custom warning template
  
  // Logging
  detailedLog: boolean
}

export interface BaiduConfig {
  apiKey: string
  secretKey: string
}

export interface AliyunConfig {
  accessKeyId: string
  accessKeySecret: string
  endpoint: string
}

export interface TencentConfig {
  secretId: string
  secretKey: string
  region: string
}

export interface OpenAIConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export interface Config {
  // Global Settings
  debug: boolean
  adminList: string[]
  
  // Services Switch (For UI Hiding)
  useApi: boolean
  useBaidu: boolean
  useAliyun: boolean
  useTencent: boolean
  useOpenAI: boolean
  useEmail: boolean

  smtp?: SmtpConfig
  api?: ApiConfig
  baidu?: BaiduConfig
  aliyun?: AliyunConfig
  tencent?: TencentConfig
  openai?: OpenAIConfig
  
  // Global Default Parameters
  defaultMuteMinutes: number
  defaultTriggerThreshold: number
  defaultAiThreshold: number
  defaultCheckProbability: number
  checkAdmin: boolean
  defaultShowCensoredWord: boolean

  // Group Settings
  groups: GroupConfig[]
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    debug: Schema.boolean().description('开启全局调试日志。').default(false),
    adminList: Schema.array(String).description('全局管理员列表 (OneBot 用户ID)。').role('table'),
    checkAdmin: Schema.boolean().description('是否检查机器人在群内的管理权限。').default(true),
    
    defaultMuteMinutes: Schema.number().description('全局默认禁言时长 (分钟)。').default(10).min(0.1),
    defaultTriggerThreshold: Schema.number().description('全局默认触发阈值 (次数)。').default(3).min(1),
    defaultAiThreshold: Schema.number().description('全局默认 AI 判定阈值 (0.0 - 1.0)。').default(0.6).min(0).max(1).step(0.1),
    defaultCheckProbability: Schema.number().description('全局默认检查概率 (0.0 - 1.0)。').default(1.0).min(0).max(1).step(0.1),
    defaultShowCensoredWord: Schema.boolean().description('全局默认是否在警告中显示触发的违禁词。').default(true),
  }).description('基础设置'),

  Schema.intersect([
    Schema.object({
      useEmail: Schema.boolean().description('启用邮件通知系统').default(false),
    }).description('邮件通知开关'),
    Schema.union([
      Schema.object({
        useEmail: Schema.const(true).required(),
        smtp: Schema.object({
          host: Schema.string().description('SMTP 服务器地址').default('smtp.example.com'),
          port: Schema.number().description('SMTP 端口').default(465),
          secure: Schema.boolean().description('启用 SSL/TLS 加密链接').default(true),
          user: Schema.string().description('SMTP 用户名').default('user@example.com'),
          pass: Schema.string().role('secret').description('SMTP 密码或授权码').default('password'),
          senderName: Schema.string().description('邮件发件人显示名称').default('Koishi Bot'),
          senderEmail: Schema.string().description('邮件发件人地址').default('bot@example.com'),
          receivers: Schema.array(String).description('接收违规通知的管理员邮箱列表').role('table'),
          summaryIntervalDays: Schema.number().description('邮件汇总周期 (天)').default(1).min(0),
        }).description('邮件通知设置 (SMTP)'),
      }),
      Schema.object({}),
    ]),
  ]),

  Schema.intersect([
    Schema.object({
      useApi: Schema.boolean().description('启用在线 API 检测 (ApiHz)').default(false),
    }).description('在线 API 开关'),
    Schema.union([
      Schema.object({
        useApi: Schema.const(true).required(),
        api: Schema.object({
          apiUrl: Schema.string().description('在线检测 API 地址').default('https://cn.apihz.cn/api/zici/mgc.php'),
          apiId: Schema.string().description('ApiHz 开发者 ID').default(''),
          apiKey: Schema.string().role('secret').description('ApiHz 开发者 Key').default(''),
        }).description('在线检测设置 (ApiHz)'),
      }),
      Schema.object({}),
    ]),
  ]),

  Schema.intersect([
    Schema.object({
      useOpenAI: Schema.boolean().description('启用 AI 模型检测 (OpenAI/SiliconFlow)').default(false),
    }).description('AI 检测开关'),
    Schema.union([
      Schema.object({
        useOpenAI: Schema.const(true).required(),
        openai: Schema.object({
          apiKey: Schema.string().role('secret').description('API Key').default(''),
          baseUrl: Schema.string().description('API Base URL').default('https://api.siliconflow.cn/v1'),
          model: Schema.string().description('模型 ID').default('deepseek-ai/DeepSeek-V2.5'),
        }).description('AI 检测设置'),
      }),
      Schema.object({}),
    ]),
  ]),

  Schema.intersect([
    Schema.object({
      useBaidu: Schema.boolean().description('启用百度智能云检测').default(false),
    }).description('百度智能云开关'),
    Schema.union([
      Schema.object({
        useBaidu: Schema.const(true).required(),
        baidu: Schema.object({
          apiKey: Schema.string().description('API Key').default(''),
          secretKey: Schema.string().role('secret').description('Secret Key').default(''),
        }).description('百度智能云设置'),
      }),
      Schema.object({}),
    ]),
  ]),

  Schema.intersect([
    Schema.object({
      useAliyun: Schema.boolean().description('启用阿里云内容安全检测').default(false),
    }).description('阿里云开关'),
    Schema.union([
      Schema.object({
        useAliyun: Schema.const(true).required(),
        aliyun: Schema.object({
          accessKeyId: Schema.string().description('AccessKey ID').default(''),
          accessKeySecret: Schema.string().role('secret').description('AccessKey Secret').default(''),
          endpoint: Schema.string().description('Endpoint').default('green-cip.cn-shanghai.aliyuncs.com'),
        }).description('阿里云设置'),
      }),
      Schema.object({}),
    ]),
  ]),

  Schema.intersect([
    Schema.object({
      useTencent: Schema.boolean().description('启用腾讯云检测').default(false),
    }).description('腾讯云开关'),
    Schema.union([
      Schema.object({
        useTencent: Schema.const(true).required(),
        tencent: Schema.object({
          secretId: Schema.string().description('SecretId').default(''),
          secretKey: Schema.string().role('secret').description('SecretKey').default(''),
          region: Schema.string().description('Region').default('ap-shanghai'),
        }).description('腾讯云设置'),
      }),
      Schema.object({}),
    ]),
  ]),

  Schema.object({
    groups: Schema.array(
      Schema.object({
        id: Schema.string().hidden().default(''),
        groupId: Schema.string().description('群组 ID (群号)').required(),
        enable: Schema.boolean().description('是否启用监控').default(true),
        
        detectionMethods: Schema.array(Schema.union([
          Schema.const('local').description('本地词库 (数据库)'),
          Schema.const('ai').description('AI 模型检测'),
          Schema.const('api').description('在线 API'),
          Schema.const('baidu').description('百度智能云'),
          Schema.const('aliyun').description('阿里云'),
          Schema.const('tencent').description('腾讯云'),
        ])).role('checkbox').description('启用的检测方式').default(['local']),
        
        smartVerification: Schema.boolean().description('开启智能验证').default(false),
        contextMsgCount: Schema.number().description('智能验证上下文数量').default(3).min(1).max(10),
        
        aiThreshold: Schema.number().description('AI 判定阈值 (留空用默认)').min(0).max(1).step(0.1),
        checkProbability: Schema.number().description('检查概率 (留空用默认)').min(0).max(1).step(0.1),
        showCensoredWord: Schema.boolean().description('是否显示触发的违禁词 (留空用默认)'),

        localBadWordDict: Schema.string().description('【Legacy】本地违禁词库 (初始导入)').default(''),
          
        whitelist: Schema.array(Schema.object({
          userId: Schema.string().required().description('白名单用户 ID'),
        })).description('白名单用户').role('table'),

        warningTemplate: Schema.string().role('textarea').description('自定义警告语模板。支持变量: {at} (At用户), {userId}, {nick}, {words} (触发词), {count} (当前次数), {maxCount} (阈值), {muteMinutes} (禁言时长)'),

        triggerThreshold: Schema.number().description('触发阈值 (次数)。覆盖全局设置。').min(1),
        triggerWindowMinutes: Schema.number().description('触发窗口期 (分钟)。').default(5).min(1),
        muteMinutes: Schema.number().description('禁言时长 (分钟, 留空用默认)').min(0.1),
        
        detailedLog: Schema.boolean().description('开启详细日志').default(false),
      }).description('群组配置')
    ).description('监控群组列表').role('list').default([])
  }).description('群组监控设置')
])
