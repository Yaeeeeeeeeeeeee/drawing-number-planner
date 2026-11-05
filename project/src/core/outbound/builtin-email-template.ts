import type { OutboundEmailTemplate } from './outbound-reference-repository.js';

// Read compatibility only: never rewrite customized templates or saved draft snapshots.
const legacyUpdateBody = '{{company_name}}：\n\n{{contact_salutation}}，您好！\n\n附件为 {{model}}{{product_category}} 的更新包材资料。\n\n本次修改内容：\n{{change_description}}\n\n更新文件：\n{{file_list}}\n\n{{optional_blocks}}\n\n请更新资料并回传确认件。如有异常或任何不明之处，请及时与我联系，感谢！\n\n【收到请回复，感谢】\n\n{{signature}}';
const updateBody = '{{company_name}}：\n\n{{contact_salutation}}，您好！\n\n附件为 {{brand_name}} {{model}}{{product_category}}需要更新的包材资料，请注意查收。\n\n本次修改的内容为：\n{{change_files}}\n\n{{package_files}}\n\n{{optional_blocks}}\n\n在贵司文件确认后，烦请将重新编制的确认件发双方核对，确认无误后即可完成变更。\n上述文件如有异常或任何不明之处，请及时与我联系，感谢！\n\n【收到请回复，感谢】\n\n{{signature}}';

export function currentBuiltinEmailTemplate(template: OutboundEmailTemplate): OutboundEmailTemplate {
  if (template.key !== 'update_default' || template.materialType !== 'update'
    || template.subjectTemplate !== '{{package_name}}' || template.bodyTemplate !== legacyUpdateBody) return template;
  return { ...template, bodyTemplate: updateBody };
}
