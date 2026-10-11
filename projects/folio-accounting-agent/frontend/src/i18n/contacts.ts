export const contactsMessages = {
  en: {
    contacts: {
      title: 'Contacts', description: 'Manage the people who submit documents for your business.',
      client: 'Business', members: 'Client contacts', membersHint: 'Administrators manage contacts. Submitters can provide documents.',
      name: 'Name', email: 'Email', role: 'Access', status: 'Status', actions: 'Actions', you: 'You',
      admin: 'Client administrator', submitter: 'Submitter', edit: 'Edit access', save: 'Save changes', saving: 'Saving…', cancel: 'Cancel', remove: 'Remove',
      removeTitle: 'Remove this contact?', removeHint: '{name} will lose access to this business. Their account and access to other businesses will not be deleted.',
      loading: 'Loading contacts…', retry: 'Try again', empty: 'No contacts yet', emptyHint: 'Invite a contact below to give them access to this business.', emptyReadOnlyHint: 'No contacts are associated with this client yet.',
      saved: 'Contact access updated.', removed: 'Contact removed.', selfHint: 'Your own access cannot be changed here.',
      forbidden: 'Contact management is not available', forbiddenHint: 'You need client administrator access to manage contacts.',
      assignments: 'Assigned accountants', assignmentsHint: 'Choose the accountants who can access this client.',
      loadingAssignments: 'Loading accountants…', noAccountants: 'No active accountants', noAccountantsHint: 'Invite an accountant from Team before assigning them to this client.',
      assignmentsSaved: 'Accountant assignments saved.', unavailable: 'Accountant unavailable', invalidAssignments: 'Uncheck disabled or unavailable accountants before saving. Their assignments will only be removed when you save.',
      selected: '{count} selected', unsaved: 'Unsaved changes',
    },
  },
  'zh-CN': {
    contacts: {
      title: '联系人', description: '管理为您的企业提交材料的人员。',
      client: '企业', members: '客户联系人', membersHint: '管理员可管理联系人；提交人可提交材料。',
      name: '姓名', email: '邮箱', role: '权限', status: '状态', actions: '操作', you: '您',
      admin: '客户管理员', submitter: '提交人', edit: '修改权限', save: '保存修改', saving: '正在保存…', cancel: '取消', remove: '移除',
      removeTitle: '移除此联系人？', removeHint: '{name} 将失去此企业的访问权限。其账号及其他企业的访问权限不会被删除。',
      loading: '正在加载联系人…', retry: '重试', empty: '暂无联系人', emptyHint: '在下方邀请联系人，为其开通此企业的访问权限。', emptyReadOnlyHint: '此客户尚未关联联系人。',
      saved: '联系人权限已更新。', removed: '联系人已移除。', selfHint: '您不能在此修改自己的权限。',
      forbidden: '无法管理联系人', forbiddenHint: '只有客户管理员可以管理联系人。',
      assignments: '负责会计', assignmentsHint: '选择可以访问此客户的会计。',
      loadingAssignments: '正在加载会计…', noAccountants: '暂无在职会计', noAccountantsHint: '请先在团队页面邀请会计，再将其分配给此客户。',
      assignmentsSaved: '会计分配已保存。', unavailable: '会计不可用', invalidAssignments: '请先取消选择已禁用或不可用的会计。仅在保存后才会移除其分配。',
      selected: '已选择 {count} 人', unsaved: '有未保存的修改',
    },
  },
}
