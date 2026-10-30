import type { DimensionProfile, PackagingCatalog, PackagingMatch, PackagingParameters, TemplateCondition, TemplateMatchContext } from './packaging-types.js';

const missing = (value: unknown) => value === undefined || value === null || value === '';
function satisfies(condition: TemplateCondition, parameters: PackagingParameters): boolean {
  const actual = parameters[condition.key];
  if (missing(actual)) return false;
  if (condition.operator === 'eq') return actual === condition.value;
  if (typeof actual !== 'number' || !Number.isFinite(actual) || typeof condition.value !== 'number') return false;
  switch (condition.operator) {
    case 'lt': return actual < condition.value;
    case 'lte': return actual <= condition.value;
    case 'gt': return actual > condition.value;
    case 'gte': return actual >= condition.value;
    case 'between': return condition.max !== undefined && actual >= condition.value && actual <= condition.max;
  }
}
export function matchPackagingTemplates(catalog: PackagingCatalog, context: TemplateMatchContext): PackagingMatch {
  const config = catalog.configs.find(c => c.projectItemId === context.projectItemId);
  const required = (config?.parameters ?? []).filter(p => p.required).map(p => p.key);
  const candidates = catalog.templates.filter(t => t.status === 'active' && t.projectItemId === context.projectItemId && t.mainCategoryId === context.mainCategoryId && (!t.brandIds.length || t.brandIds.includes(context.brandId)) && (!t.productIds.length || t.productIds.includes(context.productId)));
  const missingParameters = new Set(required.filter(key => missing(context.parameters[key])));
  const templateIds: number[] = [];
  const length = config?.parameters.find(p => p.axis === 'length')?.key ?? 'length';
  const width = config?.parameters.find(p => p.axis === 'width')?.key ?? 'width';
  for (const template of candidates) {
    const rules = catalog.rules.filter(r => r.templateId === template.id);
    if (!rules.length) { if (!missingParameters.size) templateIds.push(template.id); continue; }
    let matches = false;
    for (const rule of rules.filter(r => r.status === 'active')) {
      const absent = rule.conditions.filter(c => missing(context.parameters[c.key])).map(c => c.key);
      if (absent.length) { absent.forEach(key => missingParameters.add(key)); continue; }
      if (rule.conditions.every(c => satisfies(c, context.parameters))) { matches = true; continue; }
      if (rule.allowLengthWidthSwap && length && width && !missing(context.parameters[length]) && !missing(context.parameters[width])) {
        const swapped = { ...context.parameters, [length]: context.parameters[width], [width]: context.parameters[length] };
        if (rule.conditions.every(c => satisfies(c, swapped))) matches = true;
      }
    }
    if (matches && required.every(key => !missing(context.parameters[key]))) templateIds.push(template.id);
  }
  if (templateIds.length) return { status: templateIds.length === 1 ? 'unique' : 'multiple', templateIds, missingParameters: [] };
  if (missingParameters.size) return { status: 'missing_dimensions', templateIds: [], missingParameters: [...missingParameters] };
  return { status: 'none', templateIds: [], missingParameters: [] };
}
export function resolvePackagingDimensions(catalog: PackagingCatalog, productId: number, projectItemId: number): { profiles: DimensionProfile[]; defaultProfile?: DimensionProfile } {
  const profiles = catalog.dimensions.filter(p => p.status === 'active' && p.projectItemId === projectItemId && p.productIds.includes(productId)).sort((a, b) => Number(b.scope === 'specific') - Number(a.scope === 'specific') || a.id - b.id);
  const defaultProfile = profiles.find(p => p.isDefault && (!('defaultProductIds' in p) || (p.defaultProductIds as number[]).includes(productId)));
  return { profiles, defaultProfile };
}
