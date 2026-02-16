export default {
  commands: {
    temporaryban: {
      description: 'Temporary Ban Plugin Management',
      messages: {
        permission_denied: 'Permission denied.',
        global_admin_only: 'Permission denied. This command is for global admins only.',
        group_only: 'This command must be used in a group.',
        specify_word: 'Please specify a word.',
        group_not_configured: 'This group is not configured for monitoring.',
        word_added: 'Added "{0}" to local dictionary.',
        word_exists: 'Word already exists.',
        word_removed: 'Removed "{0}".',
        word_not_found: 'Word not found.',
        no_forbidden_words: 'No forbidden words.',
        forbidden_words_list: 'Forbidden words ({0}):\n{1}',
        specify_user_id: 'Please specify user ID.',
        already_whitelisted: 'Already whitelisted.',
        user_added_whitelist: 'User {0} added to whitelist.',
        not_in_whitelist: 'Not in whitelist.',
        user_removed_whitelist: 'User {0} removed from whitelist.',
        stats_header: 'Current Monitoring Stats (Active Window):\nViolators: {0}',
        records_cleared: 'Records cleared for user {0}.',
        no_active_records: 'No active records for user {0}.',
        specify_text: 'Please specify text.',
        safe: 'Safe.',
        detected: 'Detected: {0}',
        violation_detected: 'You triggered a forbidden word check: Forbidden word: ({0})',
        report_sent: 'Report sent successfully to {0} receivers. Count: {1}',
        report_failed: 'Failed to send email: {0}',
        no_violations: 'No violations found in the specified period.',
        smtp_not_configured: 'SMTP not configured or no receivers.',
        no_history: 'No recent history for user {0}.',
        history_list: 'Recent history for user {0}:\n{1}',
        cleanup_info: 'Cache cleanup is mainly handled automatically by the system.',
        group_info: 'Group Info ({0}):\nStatus: {1}\nMethods: {2}\nSmart Verify: {3}\nThreshold: {4}\nMute: {5}min\nWhitelist: {6}',
        violation_detail: 'You triggered a forbidden word check: {0}\nCurrent violations: {1}/{2}\n{3} more violations will result in a {4} min mute.',
        ignored_word_added: 'Added "{0}" to ignored words list.',
        ignored_word_removed: 'Removed "{0}" from ignored words list.',
        no_ignored_words: 'No ignored words.',
        ignored_words_list: 'Ignored words ({0}):\n{1}',
        no_whitelist_users: 'Whitelist is empty.',
         whitelist_users_list: 'Whitelist Users ({0}):\n{1}',
         all_records_cleared: 'Cleared all violation records for this group ({0} records).'
       }
     },
    'temporaryban.info': {
      description: 'View current group configuration'
    },
    'temporaryban.whitelist': {
      description: 'Whitelist Management'
    },
    'temporaryban.whitelist.list': {
      description: 'List whitelisted users'
    },
    'temporaryban.whitelist.word': {
      description: 'Ignored Word Management'
    },
    'temporaryban.whitelist.word.add': {
      description: 'Add ignored word to group'
    },
    'temporaryban.whitelist.word.remove': {
      description: 'Remove ignored word from group'
    },
    'temporaryban.whitelist.word.list': {
      description: 'List ignored words in group'
    },
    'temporaryban.report': {
      description: 'Manually trigger violation report (Global Admin only)'
    },
    'temporaryban.history': {
      description: 'View user recent history (Admin)'
    },
    'temporaryban.cleancache': {
      description: 'Clean cache (Global Admin)'
    },
    'temporaryban.add': {
      description: 'Add a forbidden word to current group'
    },
    'temporaryban.remove': {
      description: 'Remove a forbidden word'
    },
    'temporaryban.list': {
      description: 'List forbidden words'
    },
    'temporaryban.whitelist.add': {
      description: 'Add user to whitelist'
    },
    'temporaryban.whitelist.remove': {
      description: 'Remove user from whitelist'
    },
    'temporaryban.stats': {
      description: 'View violation statistics'
    },
    'temporaryban.clean': {
      description: 'Clean violation records for a user'
    },
    'temporaryban.check': {
      description: 'Check if text contains forbidden words'
    }
  }
}
