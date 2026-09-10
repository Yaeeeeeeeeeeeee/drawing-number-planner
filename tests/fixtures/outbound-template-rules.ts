export const outboundTemplateRules = {
  initial: {
    label: '包材资料',
    subject: 'D&D - {brand} {model}{productCategory} 【包材资料-{createdDate}】',
  },
  update: {
    label: '更新包材资料',
    subject: 'D&D - {brand} {model}{productCategory} 【更新包材资料-{createdDate}】',
  },
  createdDate: '2026年9月10日',
} as const;
