export default {
  commands: {
    temporaryban: {
      description: '违禁词插件管理',
      messages: {
        permission_denied: '权限不足。',
        global_admin_only: '权限不足。此命令仅限全局管理员使用。',
        group_only: '此命令必须在群组中使用。',
        specify_word: '请指定违禁词。',
        group_not_configured: '此群组未配置监控。',
        word_added: '已添加 "{0}" 到本地词库。',
        word_exists: '词条已存在。',
        word_removed: '已移除 "{0}"。',
        word_not_found: '未找到该词条。',
        no_forbidden_words: '没有违禁词。',
        forbidden_words_list: '违禁词 ({0}):\n{1}',
        specify_user_id: '请指定用户ID。',
        already_whitelisted: '用户已在白名单中。',
        user_added_whitelist: '用户 {0} 已添加到白名单。',
        not_in_whitelist: '用户不在白名单中。',
        user_removed_whitelist: '用户 {0} 已从白名单移除。',
        stats_header: '当前监控统计 (活跃窗口):\n违规者: {0}',
        records_cleared: '已清除用户 {0} 的记录。',
        no_active_records: '用户 {0} 没有活跃记录。',
        specify_text: '请指定文本。',
        safe: '安全。',
        detected: '检测到: {0}',
        violation_detected: '您触发了违禁词检测:违禁词:({0})',
        report_sent: '报告已成功发送给 {0} 位接收者。数量: {1}',
        report_failed: '发送邮件失败: {0}',
        no_violations: '指定期间内未发现违规记录。',
        smtp_not_configured: 'SMTP 未配置或没有接收者。'
      }
    },
    'temporaryban.report': {
      description: '手动触发违规报告（仅限全局管理员）'
    },
    'temporaryban.add': {
      description: '添加违禁词到当前群组'
    },
    'temporaryban.remove': {
      description: '移除违禁词'
    },
    'temporaryban.list': {
      description: '列出违禁词'
    },
    'temporaryban.whitelist.add': {
      description: '添加用户到白名单'
    },
    'temporaryban.whitelist.remove': {
      description: '移除用户白名单'
    },
    'temporaryban.stats': {
      description: '查看违规统计'
    },
    'temporaryban.clean': {
      description: '清除用户的违规记录'
    },
    'temporaryban.check': {
      description: '检查文本是否包含违禁词'
    }
  }
}
