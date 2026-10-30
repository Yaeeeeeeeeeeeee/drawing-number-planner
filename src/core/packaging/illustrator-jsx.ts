import type { PackagingField } from './packaging-types.js';

export interface IllustratorJsxInput {
  operationId: string;
  mode: 'inspect' | 'generate' | 'open';
  templatePath?: string;
  outputPath?: string;
  pdfPath?: string;
  resultPath: string;
  fields: PackagingField[];
  values?: Record<string, string | number>;
  requiredFonts?: string[];
}

/** ExtendScript uses ES3; keep the generated program independent of a global JSON implementation. */
export function buildIllustratorJsx(input: IllustratorJsxInput): string {
  const literal = JSON.stringify(input).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `(function () {
var job = ${literal};
function quote(value) { return '"' + String(value).replace(/[\\\\"\\x00-\\x1f]/g, function (ch) { var map = {'"':'\\\\"', '\\\\':'\\\\\\\\', '\\n':'\\\\n', '\\r':'\\\\r', '\\t':'\\\\t'}; if (map[ch]) return map[ch]; var n=ch.charCodeAt(0).toString(16); return '\\\\u' + ('0000'+n).slice(-4); }) + '"'; }
function json(value) { if (value === null) return 'null'; var t=typeof value; if(t==='string')return quote(value); if(t==='number'||t==='boolean')return String(value); var out=[], k; if(value instanceof Array){for(k=0;k<value.length;k++)out.push(json(value[k]));return '['+out.join(',')+']';} for(k in value)if(value.hasOwnProperty(k)&&typeof value[k]!=='undefined')out.push(quote(k)+':'+json(value[k])); return '{'+out.join(',')+'}'; }
var inspection = {fields:[], fonts:[], issues:[], fontValidation:'declared-and-observed-only'};
var result = {operationId:job.operationId, ok:false, inspection:inspection};
var doc = null, ownsDocument = false, previousInteraction;
function issue(code,message,objectName,severity){var item={code:code,message:message,severity:severity||'error'};if(objectName)item.objectName=objectName;inspection.issues.push(item);}
function blocking(){for(var i=0;i<inspection.issues.length;i++)if(inspection.issues[i].severity==='error')return true;return false;}
function fontAvailable(name){try{var font=app.textFonts.getByName(name);return !!font&&font.name===name;}catch(e){return false;}}
function recordFont(name){for(var i=0;i<inspection.fonts.length;i++)if(inspection.fonts[i]===name)return;inspection.fonts.push(name);if(!fontAvailable(name))issue('MISSING_FONT','Font is unavailable: '+name);}
function editable(frame){try{var current=frame;while(current&&current.typename!=='Document'){if(current.locked===true||current.hidden===true||current.visible===false||current.editable===false)return false;current=current.parent;}return true;}catch(e){return false;}}
function resource(item){try{if(item.embedded===true)return;var file=item.file;if(!file||!file.exists)issue('MISSING_RESOURCE','Linked resource is unavailable'+(file&&file.fsName?': '+file.fsName:''));}catch(e){issue('MISSING_RESOURCE','Linked resource cannot be read: '+String(e));}}
try {
  previousInteraction=app.userInteractionLevel;
  app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
  if(job.mode==='open') {
    app.open(new File(job.pdfPath)); result.ok=true;
  } else {
    issue('FONT_SUBSTITUTION_NOT_VERIFIED','仅核对声明及打开后可见的字体；Illustrator 打开时可能替换原字体，请人工核对原稿。',null,'warning');
    var i,j,required=job.requiredFonts||[];
    for(i=0;i<required.length;i++)if(!fontAvailable(required[i]))issue('MISSING_FONT','Required font is unavailable: '+required[i]);
    if(!blocking()) {
      var existing=[];for(i=0;i<app.documents.length;i++)existing.push(app.documents[i]);
      doc=app.open(new File(job.templatePath));
      ownsDocument=true;
      for(i=0;i<existing.length;i++)if(existing[i]===doc){ownsDocument=false;throw new Error('Refusing to modify an already open document');}
      var frames=doc.textFrames;
      for(i=0;i<frames.length;i++) {
        var chars=frames[i].characters;
        if(chars)for(j=0;j<chars.length;j++) {try{recordFont(chars[j].characterAttributes.textFont.name);}catch(fontError){issue('FONT_INSPECTION_FAILED','Cannot inspect a text font');}}
      }
      for(i=0;i<doc.placedItems.length;i++)resource(doc.placedItems[i]);
      for(i=0;i<doc.rasterItems.length;i++)if(doc.rasterItems[i].embedded!==true)resource(doc.rasterItems[i]);
      var selected=[];
      for(i=0;i<job.fields.length;i++) {
        var field=job.fields[i],matches=[];
        for(j=0;j<frames.length;j++)if(frames[j].name===field.objectName)matches.push(frames[j]);
        var info={objectName:field.objectName,sourceKey:field.sourceKey,required:field.required,matches:matches.length,editable:matches.length===1&&editable(matches[0])};inspection.fields.push(info);
        if(matches.length===0){var nonText=false;for(j=0;j<doc.pageItems.length;j++)if(doc.pageItems[j].name===field.objectName)nonText=true;issue(nonText?'FIELD_NOT_TEXT':'MISSING_FIELD','Named TextFrame is missing: '+field.objectName,field.objectName,field.required||nonText?'error':'warning');}
        else if(matches.length>1)issue('DUPLICATE_FIELD','Named TextFrame is duplicated: '+field.objectName,field.objectName);
        else if(!info.editable)issue('UNEDITABLE_FIELD','Named TextFrame is locked, hidden or not editable: '+field.objectName,field.objectName);
        var value=job.values&&Object.prototype.hasOwnProperty.call(job.values,field.sourceKey)?job.values[field.sourceKey]:undefined;
        if(job.mode==='generate'&&typeof value!=='undefined'&&(typeof value!=='string'&&typeof value!=='number'||typeof value==='number'&&!isFinite(value)))issue('INVALID_VALUE','Data must be text or a finite number: '+field.sourceKey,field.objectName);
        if(job.mode==='generate'&&field.required&&(typeof value==='undefined'||value===null||String(value).replace(/\\s/g,'')===''))issue('MISSING_VALUE','Required data is missing: '+field.sourceKey,field.objectName);
        selected.push({frame:matches.length===1?matches[0]:null,value:value});
      }
      if(!blocking()) {
        if(job.mode==='generate') {
          for(i=0;i<selected.length;i++)if(selected[i].frame&&typeof selected[i].value!=='undefined')selected[i].frame.contents=String(selected[i].value);
          var pdfOptions=new PDFSaveOptions();pdfOptions.preserveEditability=true;
          doc.saveAs(new File(job.outputPath),pdfOptions);
        }
        result.ok=true;
      }
    }
    if(!result.ok)result.error={code:'TEMPLATE_VALIDATION_FAILED',message:'Template preflight failed; see inspection issues'};
  }
} catch(e) { result.ok=false;result.error={code:'ILLUSTRATOR_SCRIPT_FAILED',message:String(e)}; }
finally {
  if(doc&&ownsDocument)try{doc.close(SaveOptions.DONOTSAVECHANGES);}catch(closeError){result.ok=false;result.error={code:'DOCUMENT_CLOSE_FAILED',message:String(closeError)};}
  try{if(typeof previousInteraction!=='undefined')app.userInteractionLevel=previousInteraction;}catch(restoreError){result.ok=false;result.error={code:'ILLUSTRATOR_RESTORE_FAILED',message:String(restoreError)};}
}
var target=new File(job.resultPath);target.encoding='UTF-8';if(!target.open('w'))throw new Error('Cannot write Illustrator operation result');try{target.write(json(result));}finally{target.close();}
}());`;
}
