// @vitest-environment node
import { expect, it } from 'vitest';
import { matchPackagingTemplates, resolvePackagingDimensions } from '../../../src/core/packaging/packaging-matcher';
import type { PackagingCatalog, PackagingTemplate } from '../../../src/core/packaging/packaging-types';
const template:PackagingTemplate={id:1,name:'Carton',mainCategoryId:10,projectItemId:11,brandIds:[20],productIds:[30],fields:[],requiredFonts:[],status:'active',fileName:'x.ait',assetRelativePath:'x',sha256:'x',revision:1,createdAt:'',updatedAt:''};
const catalog:PackagingCatalog={templates:[template],dimensions:[],rules:[{id:1,name:'Size',templateId:1,conditions:[{key:'l',operator:'between',value:590,max:610},{key:'w',operator:'lte',value:460},{key:'h',operator:'eq',value:400}],allowLengthWidthSwap:true,status:'active'}],configs:[{projectItemId:11,mode:'ait',parameters:[{key:'l',label:'长',type:'number',required:true,axis:'length'},{key:'w',label:'宽',type:'number',required:true,axis:'width'},{key:'h',label:'高',type:'number',required:true,axis:'height'}]}]};
const context={productId:30,brandId:20,mainCategoryId:10,projectItemId:11,parameters:{l:450,w:600,h:400}};
it('matches ranges with only declared length and width exchange and preserves ambiguity',()=>{expect(matchPackagingTemplates(catalog,context)).toEqual({status:'unique',templateIds:[1],missingParameters:[]});expect(matchPackagingTemplates(catalog,{...context,parameters:{l:400,w:450,h:600}}).status).toBe('none');expect(matchPackagingTemplates({...catalog,templates:[template,{...template,id:2}],rules:[...catalog.rules,{...catalog.rules[0],id:2,templateId:2}]},context)).toEqual({status:'multiple',templateIds:[1,2],missingParameters:[]});});
it('reports missing configured/rule dimensions and excludes wrong identity or disabled rules/templates',()=>{expect(matchPackagingTemplates(catalog,{...context,parameters:{l:600}})).toEqual({status:'missing_dimensions',templateIds:[],missingParameters:['w','h']});expect(matchPackagingTemplates(catalog,{...context,productId:31}).status).toBe('none');expect(matchPackagingTemplates({...catalog,templates:[{...template,status:'inactive'}]},context).status).toBe('none');expect(matchPackagingTemplates({...catalog,rules:[{...catalog.rules[0],status:'inactive'}]},context).status).toBe('none');});
it('supports fixed templates and text parameter equality without hard coded dimensions',()=>{const fixed={...catalog,rules:[],configs:[]};expect(matchPackagingTemplates(fixed,{...context,parameters:{}}).status).toBe('unique');expect(matchPackagingTemplates({...fixed,rules:[{id:1,templateId:1,name:'Page',conditions:[{key:'page',operator:'eq' as const,value:'A4'}],allowLengthWidthSwap:false,status:'active' as const}]},{...context,parameters:{page:'A4'}}).status).toBe('unique');});
it('lists specific dimensions first but does not choose between conflicting active defaults',()=>{const base={name:'Size',projectItemId:11,parameters:{l:10},isDefault:true,revision:1,status:'active' as const};const shared={...base,id:1,scope:'shared' as const,productIds:[30,31]};const specific={...base,id:2,scope:'specific' as const,productIds:[30]};const result=resolvePackagingDimensions({...catalog,dimensions:[shared,specific]},30,11);expect(result.profiles.map(p=>p.id)).toEqual([2,1]);expect(result.defaultProfile).toBeUndefined();expect(result.conflictingDefaults?.map(p=>p.id)).toEqual([2,1]);});

it('swaps conventional length and width keys without requiring a separate parameter configuration',()=>{const conventional={...catalog,configs:[],rules:[{...catalog.rules[0],conditions:[{key:'length',operator:'eq' as const,value:600},{key:'width',operator:'eq' as const,value:450},{key:'height',operator:'eq' as const,value:400}]}]};expect(matchPackagingTemplates(conventional,{...context,parameters:{length:450,width:600,height:400}}).status).toBe('unique');});


it('prefers an explicitly matching brand before dimension precision and leaves other brands unrestricted',()=>{
 const broad={...template,id:2,brandIds:[]};
 const value={...catalog,templates:[template,broad],rules:[catalog.rules[0],{...catalog.rules[0],id:2,templateId:2,conditions:[{key:'l',operator:'eq' as const,value:600},{key:'w',operator:'eq' as const,value:450},{key:'h',operator:'eq' as const,value:400}]}]};
 expect(matchPackagingTemplates(value,context).templateIds).toEqual([1]);
 expect(matchPackagingTemplates(value,{...context,brandId:21}).templateIds).toEqual([2]);
});
it('prefers a fully exact dimensional match after brand restrictions',()=>{
 const exact={...catalog.rules[0],id:2,templateId:2,conditions:[{key:'l',operator:'eq' as const,value:600},{key:'w',operator:'eq' as const,value:450},{key:'h',operator:'eq' as const,value:400}]};
 expect(matchPackagingTemplates({...catalog,templates:[template,{...template,id:2}],rules:[catalog.rules[0],exact]},context)).toEqual({status:'unique',templateIds:[2],missingParameters:[]});
});
it('keeps multiple non-exact matches conflicting even when one range is narrower',()=>{
 const narrower={...catalog.rules[0],id:2,templateId:2,conditions:[{key:'l',operator:'between' as const,value:599,max:601},{key:'w',operator:'between' as const,value:449,max:451},{key:'h',operator:'eq' as const,value:400}]};
 expect(matchPackagingTemplates({...catalog,templates:[template,{...template,id:2}],rules:[catalog.rules[0],narrower]},context)).toEqual({status:'multiple',templateIds:[1,2],missingParameters:[]});
});
it('does not call one equal dimension a full exact match when the configured dimensions are unconstrained',()=>{
 const partial={...catalog.rules[0],id:2,templateId:2,conditions:[{key:'h',operator:'eq' as const,value:400}]};
 expect(matchPackagingTemplates({...catalog,templates:[template,{...template,id:2}],rules:[catalog.rules[0],partial]},context).status).toBe('multiple');
});
it('keeps multiple fully exact templates conflicting without ordering by id',()=>{
 const exact={...catalog.rules[0],conditions:[{key:'l',operator:'eq' as const,value:600},{key:'w',operator:'eq' as const,value:450},{key:'h',operator:'eq' as const,value:400}]};
 expect(matchPackagingTemplates({...catalog,templates:[template,{...template,id:2}],rules:[exact,{...exact,id:2,templateId:2}]},context)).toEqual({status:'multiple',templateIds:[1,2],missingParameters:[]});
});

it('uses defaults only for the explicitly bound product, ignoring defaults assigned to another product',()=>{
 const profile={id:1,name:'共享尺寸',projectItemId:11,scope:'shared' as const,productIds:[30,31],isDefault:true,defaultProductIds:[31],parameters:{l:10},status:'active' as const,revision:1};
 expect(resolvePackagingDimensions({...catalog,dimensions:[profile]},30,11).defaultProfile).toBeUndefined();
 expect(resolvePackagingDimensions({...catalog,dimensions:[profile]},31,11).defaultProfile?.id).toBe(1);
});
