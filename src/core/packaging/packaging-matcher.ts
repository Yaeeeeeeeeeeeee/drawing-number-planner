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
  const matches: Array<{id:number;brandSpecific:boolean;exact:boolean}> = [];
  const requiredNumbers=(config?.parameters??[]).filter(parameter=>parameter.required&&parameter.type==='number').map(parameter=>parameter.key);
  const length = config?.parameters.find(p => p.axis === 'length')?.key ?? 'length';
  const width = config?.parameters.find(p => p.axis === 'width')?.key ?? 'width';
  for (const template of candidates) {
    const rules = catalog.rules.filter(r => r.templateId === template.id);
    if (!rules.length) { if (required.every(key=>!missing(context.parameters[key]))) matches.push({id:template.id,brandSpecific:template.brandIds.length>0,exact:false}); continue; }
    let matched = false,exact = false;
    for (const rule of rules.filter(r => r.status === 'active')) {
      const absent = rule.conditions.filter(c => missing(context.parameters[c.key])).map(c => c.key);
      if (absent.length) { absent.forEach(key => missingParameters.add(key)); continue; }
      let ruleMatches=rule.conditions.every(c => satisfies(c, context.parameters));
      if (!ruleMatches&&rule.allowLengthWidthSwap && length && width && !missing(context.parameters[length]) && !missing(context.parameters[width])) {
        const swapped = { ...context.parameters, [length]: context.parameters[width], [width]: context.parameters[length] };
        if (rule.conditions.every(c => satisfies(c, swapped))) ruleMatches = true;
      }
      if(ruleMatches){
        matched=true;
        const numeric=rule.conditions.filter(condition=>typeof condition.value==='number');
        const point=(condition:TemplateCondition)=>condition.operator==='eq'||(condition.operator==='between'&&condition.value===condition.max);
        if(numeric.length>0&&numeric.every(point)&&requiredNumbers.every(key=>numeric.some(condition=>condition.key===key&&point(condition))))exact=true;
      }
    }
    if (matched && required.every(key => !missing(context.parameters[key]))) matches.push({id:template.id,brandSpecific:template.brandIds.length>0,exact});
  }
  // Confirmed precedence: explicit brand, then fully equal dimensions. Range width never breaks a tie.
  const branded=matches.some(item=>item.brandSpecific)?matches.filter(item=>item.brandSpecific):matches;
  const preferred=branded.some(item=>item.exact)?branded.filter(item=>item.exact):branded;
  const templateIds=preferred.map(item=>item.id);
  if (templateIds.length) return { status: templateIds.length === 1 ? 'unique' : 'multiple', templateIds, missingParameters: [] };
  if (missingParameters.size) return { status: 'missing_dimensions', templateIds: [], missingParameters: [...missingParameters] };
  return { status: 'none', templateIds: [], missingParameters: [] };
}
export function resolvePackagingDimensions(catalog: PackagingCatalog, productId: number, projectItemId: number): { profiles: DimensionProfile[]; defaultProfile?: DimensionProfile; conflictingDefaults:DimensionProfile[] } {
  const profiles = catalog.dimensions.filter(p => p.status === 'active' && p.projectItemId === projectItemId && p.productIds.includes(productId)).sort((a, b) => Number(b.scope === 'specific') - Number(a.scope === 'specific') || a.id - b.id);
  const defaults = profiles.filter(p => p.isDefault && (!('defaultProductIds' in p) || (p.defaultProductIds as number[]).includes(productId)));
  return { profiles, defaultProfile:defaults.length===1?defaults[0]:undefined, conflictingDefaults:defaults.length>1?defaults:[] };
}
