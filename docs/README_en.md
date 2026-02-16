# koishi-plugin-temporaryban

[![GitHub stars](https://img.shields.io/github/stars/koishijs/koishi-plugin-temporaryban?style=flat-square)](https://github.com/koishijs/koishi-plugin-temporaryban)
[![Code Size](https://img.shields.io/github/languages/code-size/koishijs/koishi-plugin-temporaryban?style=flat-square)](https://github.com/koishijs/koishi-plugin-temporaryban)
[![Last Commit](https://img.shields.io/github/last-commit/koishijs/koishi-plugin-temporaryban?style=flat-square)](https://github.com/koishijs/koishi-plugin-temporaryban)
[![Issues](https://img.shields.io/github/issues/koishijs/koishi-plugin-temporaryban?style=flat-square)](https://github.com/koishijs/koishi-plugin-temporaryban/issues)
[![Pull Requests](https://img.shields.io/github/issues-pr/koishijs/koishi-plugin-temporaryban?style=flat-square)](https://github.com/koishijs/koishi-plugin-temporaryban/pulls)

A powerful Koishi forbidden words detection and temporary ban plugin. Supports database persistence for word lists, multiple detection mechanisms, automatic email reporting, and comprehensive group management commands.

### ✨ Key Features

- **Multiple Detection Mechanisms**:
  - 🏠 **Local Dictionary (Database)**: Supports dynamic addition/deletion via database, no restart required.
  - ☁️ **Cloud API**: Integrated **Baidu AI**, **Aliyun Green**, and **Tencent Cloud TMS** for intelligent detection.
  - 🌐 **Online API**: Supports generic online API detection.
  - 🧠 **AI (LLM)**: Supports OpenAI-compatible APIs (SiliconFlow, DeepSeek, etc.) for advanced context-aware moderation.
- **Smart Verification & Context Analysis**:
  - 🕵️ **Smart Verification**: Can be configured to use AI to verify violations detected by Local/API methods, reducing false positives.
  - 📝 **Context Awareness**: Analyzes recent chat history to understand context (e.g., distinguishing between a joke and a real threat).
- **Smart Punishment System**:
  - 🚫 Automatically recalls violating messages.
  - ⏱️ Triggers automatic mute after cumulative violations.
  - 🛡️ **Dynamic Whitelist**: Automatically recognizes group owners and admins; supports manual user whitelist configuration.
- **Email Notification & Summary**:
  - 📧 Supports immediate notification for each violation.
  - 📊 **Daily/Periodic Summary**: Supports sending summary reports every N days to avoid spam.
  - 🎨 Beautiful HTML email templates.
- **Convenient Management Commands**:
  - New `temporaryban` command system for managing word lists, whitelists, and viewing statistics directly in groups.

### 📦 Installation

This plugin depends on Koishi's **Database** service. Please ensure you have installed and configured a database plugin (e.g., MySQL, SQLite).

```bash
# Install plugin
npm install koishi-plugin-temporaryban

# Install database plugin (e.g., mysql)
npm install @koishijs/plugin-database-mysql
```

### ⚙️ Configuration

#### 1. Basic Settings

- **`debug`**: Enable debug mode for detailed logs.
- **`adminList`**: Global admin list (User ID). Users in this list can use advanced management commands (e.g., manual report trigger).
- **`checkAdmin`**: Whether to check bot's admin permission in group. If true, bot will skip checking if it is not an admin/owner. Default: true.

#### 2. Global Default Parameters

These parameters act as defaults if not configured specifically for a group:

- **`defaultMuteMinutes`**: Default mute duration (minutes).
- **`defaultTriggerThreshold`**: Default violation count threshold.
- **`defaultAiThreshold`**: Default AI strictness (0.0 - 1.0).
- **`defaultCheckProbability`**: Default check probability (0.0 - 1.0).

#### 3. Cloud API Configuration

Supports **Baidu AI**, **Aliyun**, and **Tencent Cloud**. Configure the respective sections (`baidu`, `aliyun`, `tencent`) with your API keys if you wish to use them.

#### 3. Email Notification (SMTP)

| Option | Description | Example |
| --- | --- | --- |
| `host` | SMTP Server Address | `smtp.qq.com` |
| `port` | SMTP Port | `465` (SSL) |
| `user` | Sender Account | `123456@qq.com` |
| `pass` | **Authorization Code/Password** | Use Auth Code for QQ Mail |
| `receivers` | List of admin emails to receive notifications | `['admin@example.com']` |
| `summaryIntervalDays` | **Summary Interval (Days)** | `1` (Daily); `0` (Immediate) |

#### 4. Group Monitoring (Groups)

You can configure each group separately:

- **`groupId`**: Target Group ID.
- **`detectionMethods`**: Enabled detection methods (Multi-select: `local`, `api`, `ai`, `baidu`, `aliyun`, `tencent`).
- **`smartVerification`**: Enable Smart Verification. If true, a violation detected by `local` or `api` will trigger an AI check on the context to confirm. (Requires `ai` method configuration).
- **`contextMsgCount`**: Number of recent messages to include in context analysis (Default: 3).
- **`aiThreshold`**: AI Strictness Threshold (0.0 - 1.0). Higher means stricter (only high confidence violations are punished). Leave empty to use global default.
- **`checkProbability`**: Probability to check a message (0.0 - 1.0). 1.0 means check all. Leave empty to use global default.
- **`triggerThreshold`**: Violations count to trigger mute. Leave empty to use global default.
- **`triggerWindowMinutes`**: Violation counting window (Default: 5 mins).
- **`muteMinutes`**: Mute duration. Leave empty to use global default.
- **`detailedLog`**: Enable detailed debug logs for this group.

### 💻 Commands

All commands start with `temporaryban`.

#### Global Commands
*Global Admins (`config.adminList`) only*

- **`temporaryban.report`**
  - Manually trigger a violation summary report for the last 24 hours and send via email.
- **`temporaryban.cleancache`**
  - Manually trigger cache cleanup (if applicable).

#### Group Management Commands
*Group Owner, Group Admin, or Global Admin only*

- **`temporaryban.add <word>`**
  - Add a forbidden word to the current group dictionary.
- **`temporaryban.remove <word>`**
  - Remove a forbidden word from the current group dictionary.
- **`temporaryban.list`**
  - List all forbidden words in the current group.
- **`temporaryban.whitelist.add <user>`**
  - Add a user to the current group whitelist.
- **`temporaryban.whitelist.remove <user>`**
  - Remove a user from the current group whitelist.
- **`temporaryban.stats`**
  - View violation statistics for the current period.
- **`temporaryban.clean <user>`**
  - Clear violation records for a user (Manual pardon).
- **`temporaryban.check <text>`**
  - Check if text contains forbidden words (Detection only, no punishment).
- **`temporaryban.history <user> [limit]`**
  - View recent chat history of a user (Stored in DB for context verification).
- **`temporaryban.info`**
  - View current group configuration (Enabled status, methods, thresholds, etc.).

### 🛠️ Development

This project follows a modular structure:

- **`src/commands/`**: Command implementations split by category.
- **`src/services/`**: Core logic (Detector, Mailer).
- **`src/utils/`**: Helper functions and types.
- **`src/locales/`**: Internationalization files.

## 📝 License

MIT
