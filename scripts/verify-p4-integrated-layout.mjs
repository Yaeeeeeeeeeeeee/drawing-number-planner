import {chromium} from '@playwright/test';
import fs from 'node:fs';
import {drawingLibraryMockDetails} from '../src/renderer/pages/drawing-library-mock.ts';
const product={id:1,brandId:1,brandName:'样例品牌',productSizeId:2,productSizeName:'6L',defaultAppearanceId:3,defaultAppearanceName:'标准外观',sku:'SKU-T40',model:'T40',productCategory:'洗碗机',referenceProductId:null,referenceProductModel:null,status:'active'};
const drawing=structuredClone(drawingLibraryMockDetails.get(1));
const batch={id:1,productId:1,sku:product.sku,model:product.model,name:'01.20261001',relativePath:'洗碗机/SKU-T40-T40/01.20261001',productDirectory:'洗碗机/SKU-T40-T40',sequenceNumber:1,recognitionStatus:'recognized',currentState:'current',isPresent:true,usageProducts:[{productId:1,state:'current',drawingCount:1}],confirmedDrawingCount:1};
drawing.businessUsage=[{origin:'planned',recordId:1,productId:1,batchId:1,batchName:batch.name,source:'bom',sourceId:1,current:true,sku:product.sku,model:product.model}];
drawing.currentBomUsage=[{bomVersionId:1,productId:1,model:product.model,colorId:1,colorName:'白色',versionNumber:1,projectItemId:1,projectItemName:'说明书',quantity:1,usesWhiteMaterial:false}];
drawing.batchUsage.occurrences[0].files=[...drawing.sourceFiles,...drawing.outlinedFiles];
const template={id:2,key:'update_default',name:'更新包材资料',materialType:'update',subjectTemplate:'{{package_name}}',bodyTemplate:'{{signature}}',status:'active',createdAt:'',updatedAt:'',blocks:[]};
const signature={id:5,name:'默认签名',content:'联系信息与签名正文',isDefault:true,status:'active',createdAt:'',updatedAt:''};
const contact={id:1,company:'供应商甲',contactName:'王经理',email:'wang@example.com',defaultRecipientType:'to',status:'active',notes:null,createdAt:'',updatedAt:''};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
fs.mkdirSync('docs/screenshots/p4-integrated-20261017',{recursive:true});fs.mkdirSync('work/p4-integrated-ui',{recursive:true});const results=[];
try{for(const [width,height] of [[3840,2160],[2560,1440],[1920,1080],[1366,768],[1100,760],[720,600]]){
 const page=await browser.newPage({viewport:{width,height}}),writes=[],errors=[],queries=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{const r=route.request(),u=new URL(r.url()),p=u.pathname;if(!['GET','HEAD'].includes(r.method())&&p!='/api/session')writes.push(r.method()+' '+p);let body;
 if(p==='/api/session')body={token:'isolated-fixture'};
 else if(p==='/api/products')body={items:[product]};else if(p.startsWith('/api/dictionaries'))body={items:[{id:1,name:'样例品牌',code:'02',status:'active'}]};
 else if(p==='/api/drawings/navigation')body={batches:[batch]};else if(p==='/api/drawings'){queries.push(Object.fromEntries(u.searchParams));body={items:[drawing],total:1,page:1,pageSize:50};}else if(p==='/api/drawings/1')body=drawing;
 else if(p==='/api/files/material-batches')body={items:[batch]};else if(p==='/api/material-batches')body={items:[batch]};
 else if(p.includes('settings'))body={workspaceRoot:null,configured:false,available:false};
 else if(p==='/api/outbound-reference/templates')body={items:[template]};else if(p==='/api/outbound-reference/signatures')body={items:[signature]};else if(p==='/api/outbound-reference/contacts')body={items:[contact]};
 else if(p==='/api/outbound-packages')body=[];else if(p.includes('qr-codes')||p.includes('qr-purposes'))body={items:[]};else body={items:[],total:0,page:1,pageSize:50};await route.fulfill({json:body});});
 async function nav(name){const t=page.getByRole('button',{name:'展开导航',exact:true});if(await t.isVisible())await t.click();await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name,exact:true}).click();}
 async function capture(name){if([3840,1920,1100].includes(width))await page.screenshot({path:`docs/screenshots/p4-integrated-20261017/${name}-${width}.png`});}
 async function geometry(name){await page.waitForTimeout(200);const g=await page.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1}));if(g.overflow)throw Error(name+' overflow '+width);return g;}
 await page.goto('http://127.0.0.1:5193/');await page.evaluate(()=>{const n=document.createElement('span');n.textContent='自动化接口夹具 · 非真实业务数据';Object.assign(n.style,{position:'fixed',right:'10px',bottom:'5px',background:'#fff',border:'1px solid #ccc',padding:'4px',zIndex:99999,fontSize:'12px'});document.body.append(n);});
 await nav('图号库');await page.getByRole('button',{name:drawing.fullCode,exact:true}).waitFor();
 if(await page.getByRole('button',{name:'按图号',exact:true}).count()||await page.getByRole('columnheader',{name:'资料使用',exact:true}).count())throw Error('Removed mode/column remains');
 let tree=page.getByRole('navigation',{name:'图号产品与批次'});if(!await tree.isVisible())await page.getByRole('button',{name:'产品／批次导航',exact:true}).click();
 await tree.getByText('SKU-T40 · T40',{exact:true}).click();await tree.getByRole('button',{name:/20261001.*当前使用/}).click();
 if(queries.at(-1)?.usageBatchId!=='1'||queries.at(-1)?.productId!=='1'||queries.at(-1)?.materialBatchId)throw Error('Wrong actual usage query '+JSON.stringify(queries.at(-1)));
 await page.getByRole('button',{name:drawing.fullCode,exact:true}).click();await page.getByRole('button',{name:'管理图号',exact:true}).waitFor();await page.waitForTimeout(250);
 const detail=page.getByRole('complementary',{name:'图号详情'});if(await detail.getByLabel('搜索现有 PDF').count())throw Error('PDF maintenance visible in view');
 const compact=await detail.evaluate(n=>({width:n.getBoundingClientRect().width,overflow:n.scrollWidth>n.clientWidth+1,openPaths:[...n.querySelectorAll('details')].filter(d=>d.open).length}));if(compact.overflow||compact.openPaths)throw Error('Detail overflow/disclosures '+JSON.stringify(compact));
 await geometry('drawings');await capture('drawing-detail');await page.getByRole('button',{name:'管理图号',exact:true}).click();await page.getByRole('button',{name:'取消编辑',exact:true}).click();
 await page.getByRole('button',{name:'查看 PDF 文件',exact:true}).click();await page.getByRole('heading',{name:'PDF 文件中心',exact:true}).waitFor();if(await page.locator('main[inert]').count())throw Error('Hidden drawing modal retained inert');
 await nav('图号库');await page.getByRole('button',{name:drawing.fullCode,exact:true}).waitFor();if(!queries.some(q=>q.usageBatchId==='1'))throw Error('Scope lost');
 await nav('外发资料');await page.getByRole('button',{name:'邮件配置',exact:true}).click();await page.getByRole('heading',{name:'邮件配置',exact:true}).waitFor();
 for(const tab of ['邮件模板','邮件签名','联系人']){await page.getByRole('tab',{name:tab,exact:true}).click();await page.getByRole('button',{name:tab==='联系人'?'新增联系人':`新增${tab}`,exact:true}).waitFor();if(await page.locator('.ob-mail-configuration form').count())throw Error('Default editor shown');await geometry(tab);await capture('mail-'+tab);}
 await page.getByRole('button',{name:'新增联系人',exact:true}).click();await page.getByLabel('公司',{exact:true}).fill('未保存保护');let refused=false;page.once('dialog',async d=>{refused=true;await d.dismiss();});await page.getByRole('tab',{name:'邮件模板',exact:true}).click();if(!refused||await page.getByLabel('公司',{exact:true}).inputValue()!=='未保存保护')throw Error('Dirty tab lost');
 await geometry('contact-editor');await capture('contact-editor');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'返回外发工作台',exact:true}).click();await page.getByRole('button',{name:'预览文件',exact:true}).waitFor();await geometry('workbench');await capture('workbench');
 if(errors.length||writes.length)throw Error(JSON.stringify({errors,writes}));results.push({width,height,compact,pass:true,writes,scope:'Intercepted isolated interface fixtures, not real business data or native Windows'});await page.close();console.log('passed',width);
}}finally{await browser.close();}fs.writeFileSync('work/p4-integrated-ui/browser.json',JSON.stringify(results,null,2));
