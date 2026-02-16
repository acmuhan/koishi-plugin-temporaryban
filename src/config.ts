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

  // Local Dictionary
  localBadWordDict: string
  
  // Violation Settings
  whitelist: WhitelistItem[]
  triggerThreshold?: number
  triggerWindowMinutes?: number
  muteMinutes?: number
  checkProbability?: number
  
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
  smtp: SmtpConfig
  api: ApiConfig
  baidu: BaiduConfig
  aliyun: AliyunConfig
  tencent: TencentConfig
  openai: OpenAIConfig
  
  // Global Default Parameters
  defaultMuteMinutes: number
  defaultTriggerThreshold: number
  defaultAiThreshold: number
  defaultCheckProbability: number
  checkAdmin: boolean

  // Group Settings
  groups: GroupConfig[]
}

export const Config: Schema<Config> = Schema.object({
  debug: Schema.boolean().description('开启全局调试日志。开启后，控制台将输出详细的消息处理流程和错误堆栈，建议仅在排查问题时启用。').default(false),
  adminList: Schema.array(String).description('全局管理员列表 (OneBot 用户ID)。在此列表中的用户可以使用 `temporaryban.report` 等高级管理指令，拥有最高权限。').role('table'),
  
  checkAdmin: Schema.boolean().description('是否检查机器人在群内的管理权限。开启后，如果机器人不是群主或管理员，将不执行违禁词检查。').default(true),
  
  defaultMuteMinutes: Schema.number().description('全局默认禁言时长 (分钟)。当群组未配置时使用。').default(10).min(0.1),
  defaultTriggerThreshold: Schema.number().description('全局默认触发阈值 (次数)。当群组未配置时使用。').default(3).min(1),
  defaultAiThreshold: Schema.number().description('全局默认 AI 判定阈值 (0.0 - 1.0)。当群组未配置时使用。').default(0.6).min(0).max(1).step(0.1),
  defaultCheckProbability: Schema.number().description('全局默认检查概率 (0.0 - 1.0)。1.0 表示检查所有消息。当群组未配置时使用。').default(1.0).min(0).max(1).step(0.1),

  smtp: Schema.object({
    host: Schema.string().description('SMTP 服务器地址 (例如 smtp.qq.com, smtp.163.com)').default('smtp.example.com'),
    port: Schema.number().description('SMTP 端口 (SSL通常为465, 非SSL通常为25)').default(465),
    secure: Schema.boolean().description('启用 SSL/TLS 加密链接。如果端口是465，通常需要开启此项。').default(true),
    user: Schema.string().description('SMTP 用户名 (通常是您的邮箱地址)').default('user@example.com'),
    pass: Schema.string().role('secret').description('SMTP 密码或授权码。注意：QQ邮箱/163邮箱等通常需要使用生成的授权码，而非登录密码。').default('password'),
    senderName: Schema.string().description('邮件发件人显示名称').default('Koishi Bot'),
    senderEmail: Schema.string().description('邮件发件人地址 (必须与SMTP用户名匹配)').default('bot@example.com'),
    receivers: Schema.array(String).description('接收违规通知的管理员邮箱列表').role('table'),
    summaryIntervalDays: Schema.number().description('邮件汇总周期 (天)。设置为 0 时，每条违规都会立即发送邮件；设置为 >0 时 (如 1)，将每隔 N 天发送一次违规汇总报告。').default(1).min(0),
  }).description('邮件通知设置 (SMTP)'),

  api: Schema.object({
    apiUrl: Schema.string().description('在线检测 API 地址 (默认使用 ApiHz 接口)').default('https://cn.apihz.cn/api/zici/mgc.php'),
    apiId: Schema.string().description('ApiHz 开发者 ID (必填，否则无法使用 API 检测)').default(''),
    apiKey: Schema.string().role('secret').description('ApiHz 开发者 Key (必填)').default(''),
  }).description('在线检测设置 (ApiHz)'),

  openai: Schema.object({
    apiKey: Schema.string().role('secret').description('OpenAI/SiliconFlow API Key').default(''),
    baseUrl: Schema.string().description('API Base URL (默认为 SiliconFlow)').default('https://api.siliconflow.cn/v1'),
    model: Schema.string().description('模型 ID').default('deepseek-ai/DeepSeek-V2.5'),
  }).description('AI 检测设置 (OpenAI/SiliconFlow)'),

  baidu: Schema.object({
    apiKey: Schema.string().description('百度智能云 API Key').default(''),
    secretKey: Schema.string().role('secret').description('百度智能云 Secret Key').default(''),
  }).description('百度智能云设置'),

  aliyun: Schema.object({
    accessKeyId: Schema.string().description('阿里云 AccessKey ID').default(''),
    accessKeySecret: Schema.string().role('secret').description('阿里云 AccessKey Secret').default(''),
    endpoint: Schema.string().description('阿里云内容安全 Endpoint').default('green-cip.cn-shanghai.aliyuncs.com'),
  }).description('阿里云内容安全设置'),

  tencent: Schema.object({
    secretId: Schema.string().description('腾讯云 SecretId').default(''),
    secretKey: Schema.string().role('secret').description('腾讯云 SecretKey').default(''),
    region: Schema.string().description('腾讯云地域 (例如 ap-shanghai)').default('ap-shanghai'),
  }).description('腾讯云内容安全设置'),

  groups: Schema.array(
    Schema.object({
      id: Schema.string().hidden().default(''),
      groupId: Schema.string().description('群组 ID (群号)。机器人将监控此群内的消息。').required(),
      enable: Schema.boolean().description('是否启用对该群组的监控。关闭后插件将忽略该群的所有消息。').default(true),
      
      detectionMethods: Schema.array(Schema.union([
        Schema.const('local').description('本地词库 (数据库)'),
        Schema.const('ai').description('AI 模型检测 (OpenAI/SiliconFlow)'),
        Schema.const('api').description('在线 API (ApiHz)'),
        Schema.const('baidu').description('百度智能云'),
        Schema.const('aliyun').description('阿里云 (内容安全增强版)'),
        Schema.const('tencent').description('腾讯云 (TMS)'),
      ])).role('checkbox').description('启用的检测方式 (多选)。若开启多个，只要有任意一个检测到违规即视为违规 (除非开启了智能验证)。').default(['local']),
      
      smartVerification: Schema.boolean().description('开启智能验证 (Smart Verification)。开启后，当【本地词库】或【API】检测到违规时，不会立即惩罚，而是将该用户的最近几条聊天记录发送给 AI 进行二次确认。只有 AI 也判定违规时才执行惩罚。需确保【AI 模型检测】已配置 API Key。').default(false),
      
      contextMsgCount: Schema.number().description('智能验证时的上下文消息数量。仅在开启智能验证时生效。').default(3).min(1).max(10),
      
      aiThreshold: Schema.number().description('AI 违规判定阈值 (0.0 - 1.0)。留空则使用全局默认值。').min(0).max(1).step(0.1),
      checkProbability: Schema.number().description('消息检查概率 (0.0 - 1.0)。留空则使用全局默认值。').min(0).max(1).step(0.1),

      localBadWordDict: Schema.string()
        .description('【初始导入/Legacy】本地违禁词库配置。插件现已使用数据库存储词库。首次启动时，若数据库为空，将自动导入此处的词汇。之后的增删操作请使用指令 `temporaryban.add/remove`，此配置项将不再生效。')
        .default(''),
        
      whitelist: Schema.array(
        Schema.object({
          userId: Schema.string().description('用户 ID (QQ号)')
        })
      ).description('白名单用户列表。列表中的用户触发违禁词时不会受到惩罚。注：群管理员和群主会自动获得白名单豁免，无需在此手动添加。').role('table'),
      
      triggerThreshold: Schema.number().description('触发禁言的累计违规次数。留空则使用全局默认值。').min(1),
      triggerWindowMinutes: Schema.number().description('违规计数的时间窗口 (分钟)。在此时间内累计的违规次数达到阈值即触发禁言。超过此时间窗口后，计数将重置。').default(5).min(0.1),
      muteMinutes: Schema.number().description('禁言时长 (分钟)。留空则使用全局默认值。').min(0.1),
      
      detailedLog: Schema.boolean().description('开启此群组的详细日志。用于调试特定群组的检测逻辑。').default(false),
    }).description('群组配置')
  ).description('监控群组列表').role('list').default([])
}).description('违禁词检测插件配置')
