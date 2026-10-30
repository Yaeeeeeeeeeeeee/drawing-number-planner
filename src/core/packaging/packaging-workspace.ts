import { lstatSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, parse, relative, resolve, win32 } from 'node:path';
import type { PlannerDatabase } from '../../db/database.js';
import { buildProductDirectory } from '../files/directory-policy.js';
import type { PackagingProductDirectory } from './packaging-types.js';

export class PackagingFileError extends Error {
  constructor(public readonly code:string,message:string){super(message);this.name='PackagingFileError';}
}
const fail=(code:string,message:string):never=>{throw new PackagingFileError(code,message);};
const key=(value:string)=>value.replaceAll('\\','/').toLocaleLowerCase('en-US');
export function packagingPathSegments(value:string):string[]{
  if(typeof value!=='string'||!value||isAbsolute(value)||win32.isAbsolute(value)||/^[a-z]:/iu.test(value))fail('PACKAGING_PATH_INVALID','文件路径必须为安全相对路径');
  const segments=value.split(/[\\/]/u);
  if(segments.some(s=>!s||s==='.'||s==='..'||/[<>:"|?*\u0000-\u001f]/u.test(s)||/[ .]$/u.test(s)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(s)))fail('PACKAGING_PATH_INVALID','文件路径包含不安全的目录名称');
  return segments;
}
function maybeStat(path:string){try{return lstatSync(path);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}}
/** Validate every existing component, including case aliases on case-sensitive hosts. */
export function assertSafeAbsolutePath(input:string):string{
  if(!isAbsolute(input))fail('PACKAGING_PATH_INVALID','文件操作需要绝对路径');
  const absolute=resolve(input);let current=parse(absolute).root;
  for(const segment of relative(current,absolute).split(/[\\/]/u).filter(Boolean)){
    const parent=maybeStat(current);
    if(parent){if(!parent.isDirectory()||parent.isSymbolicLink())fail('PACKAGING_PATH_INVALID','文件路径经过链接或非目录');
      const aliases=readdirSync(current).filter(name=>key(name)===key(segment));
      if(aliases.length>1||(aliases.length===1&&aliases[0]!==segment))fail('PACKAGING_PATH_COLLISION','文件路径存在大小写冲突');}
    current=join(current,segment);const stats=maybeStat(current);
    if(stats?.isSymbolicLink())fail('PACKAGING_PATH_INVALID','文件路径不允许符号链接');
  }
  return absolute;
}
export function ensureSafeDirectory(absolute:string):void{
  const target=assertSafeAbsolutePath(absolute);let current=parse(target).root;
  for(const segment of relative(current,target).split(/[\\/]/u).filter(Boolean)){
    current=join(current,segment);assertSafeAbsolutePath(current);let stats=maybeStat(current);
    if(!stats){mkdirSync(current);stats=lstatSync(current);}
    if(!stats.isDirectory()||stats.isSymbolicLink())fail('PACKAGING_PATH_INVALID','目标目录不是普通目录');
  }
}
interface ProductRow{id:number;brandId:number;brandName:string;sku:string;model:string;productCategory:string;canonicalId:number;status:string;deletedAt:string|null}
interface Claim{path:string;productId:number}
export class PackagingWorkspace {
  constructor(private db:PlannerDatabase,private rootGetter:()=>string|null){}
  root():string{
    const configured=this.rootGetter();if(!configured||!isAbsolute(configured))return fail('PACKAGING_WORKSPACE_INVALID','请先配置本机资料根目录');
    const root=assertSafeAbsolutePath(configured);if(!lstatSync(root).isDirectory())return fail('PACKAGING_WORKSPACE_INVALID','资料根目录不可用');return realpathSync(root);
  }
  path(relativePath:string):string{return assertSafeAbsolutePath(join(this.root(),...packagingPathSegments(relativePath)));}
  private products():ProductRow[]{return this.db.prepare(`select p.id,p.brand_id as brandId,b.name as brandName,coalesce(p.sku,'') as sku,p.model,p.product_category as productCategory,p.status,p.deleted_at as deletedAt,coalesce(m.canonical_product_id,p.id) as canonicalId from products p join dictionary_items b on b.id=p.brand_id left join product_identity_members m on m.raw_product_id=p.id`).all() as ProductRow[];}
  product(productId:number):{id:number;brandId:number;brandName:string;sku:string;model:string;productCategory:string}{
    const row=this.products().find(p=>p.id===productId);if(!row||row.deletedAt||row.status!=='active')return fail('PACKAGING_PRODUCT_INVALID','产品型号不存在或已停用');
    const{id,brandId,brandName,sku,model,productCategory}=row;return{id,brandId,brandName,sku,model,productCategory};
  }
  private claims():Claim[]{
    const products=this.products(),canonical=new Map(products.map(p=>[p.id,p.canonicalId]));const result:Claim[]=[];
    // Existing persisted associations preserve real directory names, including pre-rename paths.
    const rows=this.db.prepare(`select product_directory as path,product_id as productId from material_batches where product_id is not null
      union all select f.relative_path,coalesce(a.product_id,d.product_id,h.product_id,b.product_id) from pdf_files f
      left join pdf_product_assignments a on a.pdf_file_id=f.id left join drawing_numbers d on d.id=f.drawing_id
      left join historical_drawing_numbers h on h.id=f.historical_drawing_id left join material_batches b on b.id=f.material_batch_id
      where coalesce(a.product_id,d.product_id,h.product_id,b.product_id) is not null`).all() as {path:string;productId:number}[];
    for(const row of rows){const segments=packagingPathSegments(row.path);if(segments.length>=2)result.push({path:segments.slice(0,2).join('/'),productId:canonical.get(row.productId)??row.productId});}
    const root=this.root();
    for(const category of readdirSync(root,{withFileTypes:true})){
      if(!category.isDirectory()&&!category.isSymbolicLink())continue;
      const matching=products.filter(p=>key(p.productCategory)===key(category.name));if(!matching.length)continue;
      const categoryPath=this.path(category.name);if(!lstatSync(categoryPath).isDirectory())continue;
      for(const folder of readdirSync(categoryPath,{withFileTypes:true})){
        if(!folder.isDirectory()&&!folder.isSymbolicLink())continue;
        const owners=matching.filter(p=>p.sku&&key(`${p.sku}-${p.model}`)===key(folder.name));
        for(const owner of owners)result.push({path:`${category.name}/${folder.name}`,productId:owner.canonicalId});
      }
    }
    return result;
  }
  productDirectories(productId:number):PackagingProductDirectory[]{
    this.product(productId);const canonical=this.products().find(p=>p.id===productId)!.canonicalId;const unique=new Map<string,PackagingProductDirectory>();
    for(const claim of this.claims().filter(c=>c.productId===canonical)){
      const absolute=this.path(claim.path),stats=maybeStat(absolute);if(stats&&!stats.isDirectory())fail('PACKAGING_PATH_INVALID','产品资料路径不是目录');
      unique.set(key(claim.path),{productId,relativePath:claim.path,exists:Boolean(stats)});
    }
    if(!unique.size){const product=this.product(productId);if(!product.sku)fail('PACKAGING_PRODUCT_INVALID','产品缺少 SKU，不能自动创建资料目录');const path=buildProductDirectory(product).split(/[\\/]/u).join('/');const stats=maybeStat(this.path(path));unique.set(key(path),{productId,relativePath:path,exists:Boolean(stats)});}
    return [...unique.values()].sort((a,b)=>a.relativePath.localeCompare(b.relativePath));
  }
  resolveProductDirectory(productId:number,requested?:string):PackagingProductDirectory{
    const directories=this.productDirectories(productId);const selected=requested===undefined?(directories.length===1?directories[0]:undefined):directories.find(d=>key(d.relativePath)===key(packagingPathSegments(requested).join('/')));
    if(!selected)return fail('PACKAGING_DIRECTORY_AMBIGUOUS','产品资料目录不唯一，请明确选择现有目录');
    const canonical=this.products().find(p=>p.id===productId)!.canonicalId;
    const claims=[...this.claims(),...this.products().map(p=>({path:buildProductDirectory(p).split(/[\\/]/u).join('/'),productId:p.canonicalId}))];
    if(claims.some(c=>key(c.path)===key(selected.relativePath)&&c.productId!==canonical))fail('PACKAGING_DIRECTORY_SHARED','该资料目录同时属于其他产品型号，不能自动使用');
    this.path(selected.relativePath);return selected;
  }
  createTemporaryDirectories(productIds:number[]):{items:{productId:number;relativePath?:string;created?:boolean;error?:string}[]}{
    return{items:[...new Set(productIds)].map(productId=>{try{const product=this.resolveProductDirectory(productId);const relativePath=`${product.relativePath}/00.临时文件`;const absolute=this.path(relativePath),created=!maybeStat(absolute);ensureSafeDirectory(absolute);return{productId,relativePath,created};}catch(error){return{productId,error:error instanceof Error?error.message:String(error)};}})};
  }
  createTaskDirectory(productDirectory:string,taskId:string,name:string):string{
    const segments=packagingPathSegments(productDirectory);if(segments.length!==2)fail('PACKAGING_PATH_INVALID','产品目录必须为两级目录');
    if(packagingPathSegments(taskId).length!==1)fail('PACKAGING_PATH_INVALID','任务编号无效');
    const safeName=name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/gu,'_').replace(/[ .]+$/u,'').slice(0,80)||'制图';
    const path=`${segments.join('/')}/00.临时文件/当前任务_${taskId}_${safeName}`;ensureSafeDirectory(this.path(path));return path;
  }
}
