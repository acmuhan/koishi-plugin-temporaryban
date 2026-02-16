# koishi-plugin-temporaryban

[![npm](https://img.shields.io/npm/v/koishi-plugin-temporaryban?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-temporaryban)
[![npm downloads](https://img.shields.io/npm/dm/koishi-plugin-temporaryban?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-temporaryban)
[![License](https://img.shields.io/npm/l/koishi-plugin-temporaryban?style=flat-square)](https://github.com/koishijs/koishi-plugin-temporaryban/blob/master/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/koishijs/koishi-plugin-temporaryban?style=flat-square)](https://github.com/acmuhan/koishi-plugin-temporaryban)

**[中文文档](#中文) | [English Documentation](docs/README_en.md)**

---

<a name="chinese"></a>
## 📖 简介

一个功能强大的 Koishi 违禁词检测与自动禁言插件。支持数据库持久化词库、多重检测机制、自动邮件汇报以及完善的群组管理指令。

### ✨ 核心特性

- **多重检测机制**：
  - 🏠 **本地词库 (Database)**：基于数据库存储，支持动态添加/删除，无需重启。
  - ☁️ **云端检测**：集成 **百度 AI**、**阿里云内容安全**、**腾讯云 TMS**，支持智能识别。
  - 🌐 **在线 API**：支持通用 API 敏感词检测接口。
  - 🧠 **AI (大模型)**：支持 OpenAI 兼容接口 (如 SiliconFlow, DeepSeek) 进行高级语义审核。
- **智能验证与上下文分析**：
  - 🕵️ **智能验证**：可配置为当本地词库/API 命中时，调用 AI 对上下文进行二次确认，有效减少误判。
  - 📝 **上下文感知**：结合最近的聊天记录判断语境（如区分玩笑与真实攻击）。
- **智能惩罚系统**：
  - 🚫 自动撤回违规消息。
  - ⏱️ 累计违规次数触发自动禁言。
  - 🛡️ **动态白名单**：自动识别群主和管理员，免受检测；支持手动配置用户白名单。
- **邮件通知与汇总**：
  - 📧 支持每条违规立即通知。
  - 📊 **每日/定期汇总**：支持设置每 N 天发送一次违规汇总报告，避免邮件轰炸。
  - 🎨 精美的 HTML 邮件模板。
- **便捷的管理指令**：
  - 全新的 `temporaryban` 指令体系，支持在群内直接管理词库、白名单和查看统计。

### 📦 安装与依赖

本插件需要依赖 Koishi 的 **Database** 服务。请确保您已安装并配置了任意一款数据库插件（如 MySQL, SQLite 等）。

```bash
# 安装插件
npm install koishi-plugin-temporaryban

# 安装数据库插件 (以 mysql 为例)
npm install @koishijs/plugin-database-mysql
```

### ⚙️ 配置说明

#### 1. 基础设置

- **`debug`**: 开启调试模式，输出详细日志。
- **`adminList`**: 全局管理员列表 (OneBot ID)。在此列表中的用户可以使用高级管理指令（如手动触发报告）。
- **`checkAdmin`**: 是否检查机器人在群内的管理权限。若开启，当机器人不是管理员/群主时，将跳过检测。默认开启。

#### 2. 全局默认参数

当群组未单独配置时，将使用以下默认值：

- **`defaultMuteMinutes`**: 默认禁言时长 (分钟)。
- **`defaultTriggerThreshold`**: 默认触发阈值 (次数)。
- **`defaultAiThreshold`**: 默认 AI 判定阈值。
- **`defaultCheckProbability`**: 默认检查概率 (0.0 - 1.0)。

#### 3. 云端检测配置

支持 **百度 AI**、**阿里云**、**腾讯云**。请在配置项中分别填写对应的 API Key/Secret (`baidu`, `aliyun`, `tencent`) 以启用。

#### 3. 邮件通知 (SMTP)

| 配置项 | 说明 | 示例 |
| --- | --- | --- |
| `host` | SMTP 服务器地址 | `smtp.qq.com` |
| `port` | SMTP 端口 | `465` (SSL) |
| `user` | 发件人账号 | `123456@qq.com` |
| `pass` | **授权码/密码** | QQ邮箱请使用授权码 |
| `receivers` | 接收通知的管理员邮箱列表 | `['admin@example.com']` |
| `summaryIntervalDays` | **汇总周期(天)** | `1` (每天发送一次汇总); `0` (立即发送) |

#### 4. 群组监控 (Groups)

您可以为每个群组单独配置：

- **`groupId`**: 目标群号。
- **`detectionMethods`**: 启用的检测方式 (多选: `local`, `api`, `ai`, `baidu`, `aliyun`, `tencent`)。
- **`smartVerification`**: 开启智能验证。若开启，当 `local` 或 `api` 检测到违规时，会调用 AI 结合上下文进行二次确认。(需要配置 `ai` 相关参数)。
- **`contextMsgCount`**: 上下文分析时包含的最近消息数量 (默认: 3)。
- **`aiThreshold`**: AI 判定阈值 (0.0 - 1.0)。值越高越严格 (仅确信度高的才判违规)。留空则使用全局默认值。
- **`checkProbability`**: 消息检查概率 (0.0 - 1.0)。1.0 为全检。留空则使用全局默认值。
- **`triggerThreshold`**: 触发禁言的累计违规次数。留空则使用全局默认值。
- **`triggerWindowMinutes`**: 违规计数窗口时间（默认 5 分钟）。
- **`muteMinutes`**: 禁言时长。留空则使用全局默认值。
- **`detailedLog`**: 开启此群组的详细调试日志。

### 💻 指令使用

所有指令均以 `temporaryban` (或简写，需自行配置别名) 开头。

#### 全局指令
*仅限 `config.adminList` 中的全局管理员使用*

- **`temporaryban.report`**
  - 手动触发最近 24 小时的违规汇总报告并发送邮件。
- **`temporaryban.cleancache`**
  - 手动触发缓存清理（如适用）。

#### 群组管理指令
*仅限群主、群管理员或全局管理员使用*

- **`temporaryban.add <word>`**
  - 添加违禁词到当前群词库。
  - 示例：`temporaryban.add 笨蛋`
- **`temporaryban.remove <word>`**
  - 从当前群词库移除违禁词。
  - 示例：`temporaryban.remove 笨蛋`
- **`temporaryban.list`**
  - 查看当前群的所有违禁词。
- **`temporaryban.whitelist.add <user>`**
  - 将用户添加到当前群白名单。
- **`temporaryban.whitelist.remove <user>`**
  - 将用户从当前群白名单移除。
- **`temporaryban.stats`**
  - 查看当前统计周期内的违规情况。
- **`temporaryban.clean <user>`**
  - 清除某用户的违规计数（手动赦免）。
- **`temporaryban.check <text>`**
  - 检测一段文本是否包含违禁词（仅检测，不触发惩罚）。
  - 示例：`temporaryban.check 这句话有问题吗`
- **`temporaryban.history <user> [limit]`**
  - 查看用户的最近聊天记录（存储在数据库中用于上下文验证）。
- **`temporaryban.info`**
  - 查看当前群组的配置信息（启用状态、检测方式、阈值等）。

### 🛠️ 开发说明

本项目采用模块化结构开发：

- **`src/commands/`**: 按类别拆分的命令实现。
- **`src/services/`**: 核心服务逻辑 (Detector, Mailer)。
- **`src/utils/`**: 工具函数和类型定义。
- **`src/locales/`**: 国际化语言文件。

## 📝 License

MIT

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=koishijs/koishi-plugin-temporaryban&type=Date)](https://star-history.com/#acmuhan/koishi-plugin-temporaryban&Date)
