# koishi-plugin-temporaryban

[![npm](https://img.shields.io/npm/v/koishi-plugin-temporaryban?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-temporaryban)

一个功能强大的 Koishi 违禁词检测与自动禁言插件。支持数据库持久化词库、多重检测机制、自动邮件汇报以及完善的群组管理指令。

## ✨ 核心特性

- **多重检测机制**：
  - 🏠 **本地词库 (Database)**：基于数据库存储，支持动态添加/删除，无需重启。
  - 🌐 **在线 API**：集成 ApiHz 敏感词检测接口，支持智能识别。
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

## 📦 安装与依赖

本插件需要依赖 Koishi 的 **Database** 服务。请确保您已安装并配置了任意一款数据库插件（如 MySQL, SQLite 等）。

```bash
# 安装插件
npm install koishi-plugin-temporaryban

# 安装数据库插件 (以 mysql 为例)
npm install @koishijs/plugin-database-mysql
```

## ⚙️ 配置说明

### 1. 基础设置

- **`debug`**: 开启调试模式，输出详细日志。
- **`adminList`**: 全局管理员列表 (OneBot ID)。在此列表中的用户可以使用高级管理指令（如手动触发报告）。

### 2. 邮件通知 (SMTP)

| 配置项 | 说明 | 示例 |
| --- | --- | --- |
| `host` | SMTP 服务器地址 | `smtp.qq.com` |
| `port` | SMTP 端口 | `465` (SSL) |
| `user` | 发件人账号 | `123456@qq.com` |
| `pass` | **授权码/密码** | QQ邮箱请使用授权码 |
| `receivers` | 接收通知的管理员邮箱列表 | `['admin@example.com']` |
| `summaryIntervalDays` | **汇总周期(天)** | `1` (每天发送一次汇总); `0` (立即发送) |

### 3. 群组监控 (Groups)

您可以为每个群组单独配置：

- **`groupId`**: 目标群号。
- **`detectionMethod`**: 检测方式 (`local` 或 `api`)。
- **`triggerThreshold`**: 触发禁言的累计违规次数（默认 3 次）。
- **`triggerWindowMinutes`**: 违规计数窗口时间（默认 5 分钟）。
- **`muteMinutes`**: 禁言时长（默认 10 分钟）。
- **`localBadWordDict`**: **[已弃用/仅供迁移]** 首次启动时会自动将此处的词汇导入数据库。之后的增删操作请使用指令。

## 💻 指令使用

所有指令均以 `temporaryban` (或简写，需自行配置别名) 开头。

### 全局指令
*仅限 `config.adminList` 中的全局管理员使用*

- **`temporaryban.report`**
  - 手动触发最近 24 小时的违规汇总报告并发送邮件。

### 群组管理指令
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

## 🔄 迁移指南 (v1.3 -> v1.4)

v1.4 版本引入了数据库支持。更新插件后：
1. 插件会自动检测 `localBadWordDict` 中的配置。
2. 如果数据库中该群组的词库为空，插件会自动将配置文件中的词汇导入数据库。
3. 导入完成后，请使用指令管理词库。配置文件中的 `localBadWordDict` 将不再生效。

## 📝 License

MIT
