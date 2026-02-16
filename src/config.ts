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
  detectionMethod: 'local' | 'api'
  
  // Local Dictionary
  localBadWordDict: string
  
  // Violation Settings
  whitelist: WhitelistItem[]
  triggerThreshold: number
  triggerWindowMinutes: number
  muteMinutes: number
  
  // Logging
  detailedLog: boolean
}

export interface Config {
  // Global Settings
  debug: boolean
  adminList: string[]
  smtp: SmtpConfig
  api: ApiConfig
  
  // Group Settings
  groups: GroupConfig[]
}

export const Config: Schema<Config> = Schema.object({
  debug: Schema.boolean().description('开启全局调试日志（输出详细的消息处理流程，用于排查问题）').default(false),
  adminList: Schema.array(String).description('管理员列表 (OneBot 用户ID，用于使用管理指令)').role('table'),
  
  smtp: Schema.object({
    host: Schema.string().description('SMTP 服务器地址').default('smtp.example.com'),
    port: Schema.number().description('SMTP 端口').default(465),
    secure: Schema.boolean().description('启用 SSL/TLS').default(true),
    user: Schema.string().description('SMTP 用户名').default('user@example.com'),
    pass: Schema.string().role('secret').description('SMTP 密码').default('password'),
    senderName: Schema.string().description('发件人名称').default('Koishi Bot'),
    senderEmail: Schema.string().description('发件人邮箱').default('bot@example.com'),
    receivers: Schema.array(String).description('接收通知的管理员邮箱').role('table'),
    summaryIntervalDays: Schema.number().description('邮件汇总周期 (天)，设置为 0 则每条违规立即发送').default(1).min(0),
  }).description('邮件通知设置 (SMTP)'),

  api: Schema.object({
    apiUrl: Schema.string().description('API 地址').default('https://cn.apihz.cn/api/zici/mgc.php'),
    apiId: Schema.string().description('开发者 ID (ApiHz)').default(''),
    apiKey: Schema.string().role('secret').description('开发者 Key (ApiHz)').default(''),
  }).description('在线检测设置 (ApiHz)'),

  groups: Schema.array(
    Schema.object({
      id: Schema.string().hidden().default(''),
      groupId: Schema.string().description('群组 ID (群号)').required(),
      enable: Schema.boolean().description('启用监控').default(true),
      detectionMethod: Schema.union([
        Schema.const('local').description('本地词库'),
        Schema.const('api').description('在线 API (ApiHz)'),
      ]).description('检测方式').default('local'),
      
      localBadWordDict: Schema.string()
        .description('本地违禁词库 (初始导入/Legacy)。插件现已使用数据库存储词库。首次启动时，若数据库为空，将自动导入此处的词汇。之后的增删操作将直接修改数据库，不再同步回此配置。')
        .default(''),
        
      whitelist: Schema.array(
        Schema.object({
          userId: Schema.string().description('用户 ID (QQ号)')
        })
      ).description('白名单用户').role('table'),
      
      triggerThreshold: Schema.number().description('触发禁言的累计次数').default(3).min(1),
      triggerWindowMinutes: Schema.number().description('违规计数时间窗口 (分钟)').default(5).min(0.1),
      muteMinutes: Schema.number().description('禁言时长 (分钟)').default(10).min(0.1),
      
      detailedLog: Schema.boolean().description('开启此群组的详细日志').default(false),
    }).description('群组配置')
  ).description('监控群组列表').role('list').default([])
}).description('违禁词检测插件配置')
