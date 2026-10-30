import { spawn, execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import type { PackagingField } from './packaging-types.js';
import { buildIllustratorJsx, type IllustratorJsxInput } from './illustrator-jsx.js';
export type { PackagingField } from './packaging-types.js';

export interface IllustratorIssue { code: string; message: string; severity: 'error' | 'warning'; objectName?: string }
export interface IllustratorInspection {
  fields: Array<PackagingField & { matches: number; editable: boolean }>;
  fonts: string[];
  issues: IllustratorIssue[];
  /** Illustrator can substitute fonts on open; this is not proof of original-font fidelity. */
  fontValidation: 'declared-and-observed-only';
}
export interface IllustratorInspectInput { templatePath: string; fields: PackagingField[]; requiredFonts?: string[] }
export interface IllustratorGenerateInput extends IllustratorInspectInput { outputPath: string; values: Record<string, string | number> }
export interface IllustratorGenerateResult { outputPath: string; sizeBytes: number; sha256: string; preserveEditability: true }
export interface IllustratorAutomation {
  inspect(input: IllustratorInspectInput): Promise<IllustratorInspection>;
  generate(input: IllustratorGenerateInput): Promise<IllustratorGenerateResult>;
  openPdf?(pdfPath: string): Promise<void>;
}
export class IllustratorAutomationError extends Error {
  constructor(readonly code: string, message: string, readonly details?: unknown) { super(message); this.name = 'IllustratorAutomationError'; }
}
export interface IllustratorRunnerJob extends IllustratorJsxInput {
  operationDirectory: string;
  sourceTemplatePath?: string;
  scriptPath: string;
  runnerPath: string;
  completedPath: string;
}
/** Resolves only after the PowerShell/COM call has returned; it must not fake a success result. */
export type IllustratorRunner = (job: IllustratorRunnerJob) => Promise<void>;
interface TerminalResult { operationId: string; ok: boolean; inspection?: IllustratorInspection; error?: { code?: string; message?: string } }
interface ActiveOperation { operationId: string; operationDirectory: string; resultPath: string; completedPath: string; runnerPath: string }
interface Options {
  operationRoot?: string;
  timeoutMs?: number;
  platform?: NodeJS.Platform;
  runner?: IllustratorRunner;
}
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> { const next=queue.then(work,work); queue=next.catch(()=>undefined); return next; }
function fail(code:string,message:string,details?:unknown):never { throw new IllustratorAutomationError(code,message,details); }
function hashFile(path:string):string { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function cleanupVerifiedCopies(directory:string,sourceTemplatePath:string,candidateHash?:string):void {
  const copy=join(directory,'template-copy.ait');
  try{if(existsSync(copy)&&hashFile(copy)===hashFile(sourceTemplatePath))unlinkSync(copy);}catch{/* Preserve unverified or changed evidence. */}
  const candidate=join(directory,'candidate.pdf');
  try{if(candidateHash&&existsSync(candidate)&&hashFile(candidate)===candidateHash)unlinkSync(candidate);}catch{/* A cleanup failure must not erase the published PDF. */}
}
function readJson(path:string):unknown { return JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,'')); }
function terminal(path:string,operationId:string):TerminalResult|null {
  try { const value=readJson(path) as TerminalResult;return value&&value.operationId===operationId&&typeof value.ok==='boolean'?value:null; } catch {return null;}
}
function validateInspection(value:unknown):value is IllustratorInspection {
  if(!value||typeof value!=='object')return false;
  const x=value as IllustratorInspection;
  return Array.isArray(x.fields)&&x.fields.every(field=>field&&typeof field.objectName==='string'&&typeof field.sourceKey==='string'&&typeof field.required==='boolean'&&Number.isInteger(field.matches)&&field.matches>=0&&typeof field.editable==='boolean')
    &&Array.isArray(x.fonts)&&x.fonts.every(font=>typeof font==='string')&&Array.isArray(x.issues)&&x.issues.every(issue=>issue&&typeof issue.code==='string'&&typeof issue.message==='string'&&['error','warning'].includes(issue.severity))&&x.fontValidation==='declared-and-observed-only';
}
const powershell = `param([string]$JsxPath,[string]$ResultPath,[string]$CompletedPath,[string]$OperationId)
$ErrorActionPreference = 'Stop'
try {
  $illustrator = New-Object -ComObject Illustrator.Application
  $null = $illustrator.DoJavaScriptFile($JsxPath)
} catch {
  if (-not (Test-Path -LiteralPath $ResultPath)) {
    @{ operationId=$OperationId; ok=$false; error=@{ code='ILLUSTRATOR_COM_FAILED'; message=$_.Exception.Message } } | ConvertTo-Json -Depth 6 -Compress | Set-Content -LiteralPath $ResultPath -Encoding UTF8
  }
} finally {
  @{ operationId=$OperationId; finished=$true } | ConvertTo-Json -Compress | Set-Content -LiteralPath $CompletedPath -Encoding UTF8
}
`;
export const runWindowsIllustrator: IllustratorRunner = async job => {
  writeFileSync(job.runnerPath,'\uFEFF'+powershell,{flag:'wx'});
  await new Promise<void>((yes,no)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',job.runnerPath,'-JsxPath',job.scriptPath,'-ResultPath',job.resultPath,'-CompletedPath',job.completedPath,'-OperationId',job.operationId],{windowsHide:true,stdio:['ignore','ignore','pipe']});
    let stderr='';child.stderr.on('data',data=>{stderr=(stderr+String(data)).slice(-4000);});
    child.once('error',error=>{
      writeFileSync(job.resultPath,JSON.stringify({operationId:job.operationId,ok:false,error:{code:'ILLUSTRATOR_UNAVAILABLE',message:'无法启动 Windows PowerShell: '+error.message}}));
      writeFileSync(job.completedPath,JSON.stringify({operationId:job.operationId,finished:true}));no(error);
    });child.once('exit',code=>code===0?yes():no(new IllustratorAutomationError('ILLUSTRATOR_PROCESS_FAILED',stderr||`PowerShell exited with code ${code}`)));
  });
};

/** Runs only in the same user's local Node service. No browser bridge or simulated runtime output. */
export class WindowsIllustratorAutomation implements IllustratorAutomation {
  readonly operationRoot:string;
  private readonly timeoutMs:number;
  private readonly platform:NodeJS.Platform;
  private readonly runner:IllustratorRunner;
  constructor(options:Options={}) {
    this.operationRoot=resolve(options.operationRoot??join(tmpdir(),'drawing-number-planner-illustrator'));
    this.timeoutMs=options.timeoutMs??120_000;
    this.platform=options.platform??process.platform;
    this.runner=options.runner??runWindowsIllustrator;
  }
  inspect(input:IllustratorInspectInput):Promise<IllustratorInspection> {
    return serialized(async()=>{const result=await this.perform('inspect',input);cleanupVerifiedCopies(result.operationDirectory,input.templatePath);return result.inspection!;});
  }
  generate(input:IllustratorGenerateInput):Promise<IllustratorGenerateResult> {
    return serialized(async()=>{
      this.assertWindows();
      const outputPath=resolve(input.outputPath);
      if(extname(outputPath).toLowerCase()!=='.pdf')fail('INVALID_PDF_PATH','生成目标必须是 PDF 文件');
      if(existsSync(outputPath))fail('OUTPUT_EXISTS','目标 PDF 已存在，请保留原文件并选择另存为');
      if(!existsSync(dirname(outputPath))||!statSync(dirname(outputPath)).isDirectory())fail('OUTPUT_DIRECTORY_UNAVAILABLE','PDF 输出文件夹不可用');
      const result=await this.perform('generate',input);
      const candidate=result.candidate!;
      if(!existsSync(candidate)||!statSync(candidate).isFile()||statSync(candidate).size<10||!readFileSync(candidate).subarray(0,5).equals(Buffer.from('%PDF-')))fail('PDF_EXPORT_INVALID','Illustrator 未生成可读取的 PDF',result.operationDirectory);
      const sha256=hashFile(candidate);
      try{copyFileSync(candidate,outputPath,constants.COPYFILE_EXCL);}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')fail('OUTPUT_EXISTS','目标 PDF 已存在，未覆盖原文件');fail('PDF_PUBLISH_FAILED','PDF 发布失败，已保留本次生成文件',{operationDirectory:result.operationDirectory,cause:String(error)});}
      if(hashFile(outputPath)!==sha256)fail('PDF_VERIFY_FAILED','PDF 发布后校验失败，请保留文件并检查磁盘',result.operationDirectory);
      cleanupVerifiedCopies(result.operationDirectory,input.templatePath,sha256);
      return{outputPath,sizeBytes:statSync(outputPath).size,sha256,preserveEditability:true};
    });
  }
  openPdf(pdfPath:string):Promise<void> {
    return serialized(async()=>{
      this.assertWindows();
      const path=realpathSync.native(pdfPath);
      if(extname(path).toLowerCase()!=='.pdf'||!statSync(path).isFile())fail('INVALID_PDF_PATH','只允许使用 Illustrator 打开已登记的 PDF');
      await this.perform('open',{pdfPath:path,fields:[]});
    });
  }
  /** Explicit reconciliation never publishes a candidate or automatically re-runs an export. */
  reconcile(options:{abandonIfIllustratorClosed?:boolean}={}):Promise<{reconciled:boolean;operationId?:string}> {
    return serialized(async()=>{
      this.assertWindows();const active=this.readActive();if(!active)return{reconciled:false};
      const result=terminal(active.resultPath,active.operationId);
      let finished=false;
      try{const value=readJson(active.completedPath) as {operationId?:string;finished?:boolean};finished=value.operationId===active.operationId&&value.finished===true;}catch{/* Retain unsettled marker. */}
      if(!finished||!result){
        if(!options.abandonIfIllustratorClosed||!(await this.isIllustratorClosed(active)))fail('AUTOMATION_UNSETTLED','Illustrator 操作尚未确认结束，请先关闭 Illustrator，再执行中断核对',active);
      }
      unlinkSync(this.markerPath());
      return{reconciled:true,operationId:active.operationId};
    });
  }
  private assertWindows():void { if(this.platform!=='win32')fail('ILLUSTRATOR_UNAVAILABLE','Illustrator 自动制图需要在安装了 Adobe Illustrator 的 Windows 本机运行'); }
  private markerPath():string {return join(this.operationRoot,'active-operation.json');}
  private readActive():ActiveOperation|null {
    if(!existsSync(this.markerPath()))return null;
    try{const value=readJson(this.markerPath()) as ActiveOperation;if(value&&typeof value.operationId==='string'&&typeof value.resultPath==='string'&&typeof value.completedPath==='string'&&typeof value.runnerPath==='string')return value;}catch{/* Never erase unknown evidence. */}
    fail('AUTOMATION_UNSETTLED','上次 Illustrator 操作记录不完整，请保留操作目录并人工核对',this.operationRoot);
  }
  private async isIllustratorClosed(active:ActiveOperation):Promise<boolean> {
    const probePath=join(active.operationDirectory,`reconcile-${randomUUID()}.ps1`);
    writeFileSync(probePath,`param([string]$WorkerScriptPath)\n$ErrorActionPreference='Stop'\ntry {\n$ai=@(Get-Process -Name Illustrator -ErrorAction SilentlyContinue)\n$workers=@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($WorkerScriptPath) })\nif($ai.Count -eq 0 -and $workers.Count -eq 0){Write-Output 'IDLE'}else{Write-Output 'BUSY'}\n}catch{Write-Output 'UNKNOWN';exit 1}\n`,{flag:'wx'});
    return new Promise(resolveProbe=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',probePath,'-WorkerScriptPath',active.runnerPath],{windowsHide:true,timeout:10_000},(error,stdout)=>resolveProbe(!error&&stdout.trim()==='IDLE')));
  }
  private async perform(mode:'inspect'|'generate'|'open',input:IllustratorInspectInput|IllustratorGenerateInput|{pdfPath:string;fields:PackagingField[]}):Promise<{inspection?:IllustratorInspection;candidate?:string;operationDirectory:string}> {
    this.assertWindows();
    if(input.fields.some(field=>!field.objectName.trim()||!field.sourceKey.trim())||new Set(input.fields.map(field=>field.objectName)).size!==input.fields.length)fail('INVALID_FIELD_MAPPING','模板对象名称和数据字段不能为空或重复');
    mkdirSync(this.operationRoot,{recursive:true});
    const previous=this.readActive();if(previous)fail('AUTOMATION_UNSETTLED','上次 Illustrator 操作尚未核对，不能重复生成',previous);
    let sourceTemplatePath:string|undefined,sourceHash:string|undefined;
    if('templatePath' in input){sourceTemplatePath=realpathSync.native(input.templatePath);if(extname(sourceTemplatePath).toLowerCase()!=='.ait'||!statSync(sourceTemplatePath).isFile())fail('INVALID_AIT_PATH','模板必须是可读取的 AIT 文件');sourceHash=hashFile(sourceTemplatePath);}
    const operationId=randomUUID(),operationDirectory=join(this.operationRoot,operationId);
    mkdirSync(operationDirectory);
    const resultPath=join(operationDirectory,'result.json'),completedPath=join(operationDirectory,'runner-finished.json'),runnerPath=join(operationDirectory,'runner.ps1');
    const templatePath=sourceTemplatePath?join(operationDirectory,'template-copy.ait'):undefined;
    if(sourceTemplatePath&&templatePath){copyFileSync(sourceTemplatePath,templatePath,constants.COPYFILE_EXCL);if(hashFile(templatePath)!==sourceHash)fail('TEMPLATE_CHANGED','复制期间模板发生变化，请重新检查模板');}
    const candidate=mode==='generate'?join(operationDirectory,'candidate.pdf'):undefined;
    const job:IllustratorRunnerJob={operationId,mode,operationDirectory,sourceTemplatePath,templatePath,outputPath:candidate,pdfPath:'pdfPath' in input?input.pdfPath:undefined,resultPath,completedPath,runnerPath,scriptPath:join(operationDirectory,'operation.jsx'),fields:input.fields,values:'values' in input?input.values:undefined,requiredFonts:'requiredFonts' in input?input.requiredFonts:[]};
    writeFileSync(job.scriptPath,'\uFEFF'+buildIllustratorJsx(job),{flag:'wx'});
    const active:ActiveOperation={operationId,operationDirectory,resultPath,completedPath,runnerPath};
    try{writeFileSync(this.markerPath(),JSON.stringify(active),{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')fail('AUTOMATION_UNSETTLED','另一项 Illustrator 操作尚未结束');throw error;}
    let timer:ReturnType<typeof setTimeout>|undefined;
    const running=Promise.resolve().then(()=>this.runner(job)).then(()=>{
      // The real PowerShell runner also writes this before process exit, surviving Node restarts.
      writeFileSync(completedPath,JSON.stringify({operationId,finished:true}));
    });
    let runnerError:unknown;
    try {
      await Promise.race([running,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new IllustratorAutomationError('ILLUSTRATOR_TIMEOUT','Illustrator 响应超时，操作可能仍在进行；已保留记录，核对前不能重试',active)),this.timeoutMs);})]);
    }catch(error){runnerError=error;}finally{if(timer)clearTimeout(timer);}
    if(runnerError instanceof IllustratorAutomationError&&runnerError.code==='ILLUSTRATOR_TIMEOUT')throw runnerError;
    const result=terminal(resultPath,operationId);
    if(!result)fail('AUTOMATION_UNSETTLED','未收到可确认的 Illustrator 结果，未发布 PDF；请核对中断操作',{...active,cause:runnerError?String(runnerError):undefined});
    // Only a completed runner and a matching terminal result release this operation.
    if(runnerError&&!existsSync(completedPath))fail('AUTOMATION_UNSETTLED','Illustrator 调用异常结束，请核对后再继续',{...active,cause:String(runnerError)});
    unlinkSync(this.markerPath());
    if(sourceTemplatePath&&hashFile(sourceTemplatePath)!==sourceHash)fail('TEMPLATE_CHANGED','执行期间原始 AIT 内容发生变化，未发布 PDF',active);
    if(mode==='inspect'&&!result.ok&&result.error?.code==='TEMPLATE_VALIDATION_FAILED'&&validateInspection(result.inspection))return{inspection:result.inspection,operationDirectory};
    if(!result.ok)fail(result.error?.code??'ILLUSTRATOR_FAILED',result.error?.message??'Illustrator 操作失败',{...active,inspection:result.inspection});
    if(mode!=='open'){
      if(!validateInspection(result.inspection))fail('INVALID_ILLUSTRATOR_RESULT','Illustrator 返回的模板检查结果不完整',active);
      if(result.inspection.issues.some(issue=>issue.severity==='error'))fail('TEMPLATE_VALIDATION_FAILED','模板存在未解决的问题，未发布 PDF',result.inspection);
      for(const field of input.fields){const observed=result.inspection.fields.find(value=>value.objectName===field.objectName&&value.sourceKey===field.sourceKey);if(!observed||(field.required&&(observed.matches!==1||!observed.editable)))fail('TEMPLATE_VALIDATION_FAILED','模板必要对象检查未通过',result.inspection);}
    }
    return{inspection:result.inspection,candidate,operationDirectory};
  }
}
