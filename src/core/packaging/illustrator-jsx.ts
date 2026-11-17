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
var inspection = {fields:[], textObjects:[], fonts:[], issues:[], fontValidation:'declared-and-observed-only'};
var result = {operationId:job.operationId, ok:false, inspection:inspection};
var doc = null, ownsDocument = false, previousInteraction;
function issue(code,message,objectName,severity){var item={code:code,message:message,severity:severity||'error'};if(objectName)item.objectName=objectName;inspection.issues.push(item);}
function blocking(){for(var i=0;i<inspection.issues.length;i++)if(inspection.issues[i].severity==='error')return true;return false;}
function fontAvailable(name){try{var font=app.textFonts.getByName(name);return !!font&&font.name===name;}catch(e){return false;}}
function recordFont(name){for(var i=0;i<inspection.fonts.length;i++)if(inspection.fonts[i]===name)return;inspection.fonts.push(name);if(!fontAvailable(name))issue('MISSING_FONT','Font is unavailable: '+name);}
function editable(frame){try{var current=frame;while(current&&current.typename!=='Document'){if(current.locked===true||current.hidden===true||current.visible===false||current.editable===false)return false;current=current.parent;}return true;}catch(e){return false;}}
// Snapshot the layout and text attributes that replacement must preserve.
function properties(object,keys){var result=[],i,v;for(i=0;i<keys.length;i++){try{v=object&&object[keys[i]];if(v===undefined||v===null)result.push('');else if(typeof v==='object'&&typeof v.length==='number')result.push(String(v));else if(typeof v==='object'&&v.typename)result.push(properties(v,['typename','name','red','green','blue','cyan','magenta','yellow','black','gray','tint','mValueA','mValueB','mValueC','mValueD','mValueTX','mValueTY']));else if(typeof v==='object'&&v.name)result.push(String(v.name));else result.push(String(v));}catch(e){result.push('<unavailable>');}}return result.join('|');}
function layout(frame){var out=[properties(frame,['name','typename','left','top','width','height','position','rotation','matrix','kind','orientation'])],chars=frame.characters||[],i;for(i=0;i<chars.length;i++){out.push(properties(chars[i].characterAttributes,['textFont','size','fillColor','strokeColor','strokeWeight','tracking','kerningMethod','baselineShift','horizontalScale','verticalScale','rotation','leading','autoLeading','capitalization','figureStyle','ligature','underline','strikeThrough']));out.push(properties(chars[i].paragraphAttributes,['justification','firstLineIndent','leftIndent','rightIndent','spaceBefore','spaceAfter','leadingType','hyphenation']));}return out.join('~');}
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
        var name=frames[i].name;
        if(typeof name==='string'&&name.replace(/\\s/g,'')!=='') {
          var observed=null;
          for(j=0;j<inspection.textObjects.length;j++)if(inspection.textObjects[j].objectName===name)observed=inspection.textObjects[j];
          if(observed){observed.matches++;observed.editable=false;delete observed.sourceText;}
          else inspection.textObjects.push({objectName:name,matches:1,editable:editable(frames[i]),sourceText:String(frames[i].contents)});
        }
        var chars=frames[i].characters;
        if(chars)for(j=0;j<chars.length;j++) {try{recordFont(chars[j].characterAttributes.textFont.name);}catch(fontError){issue('FONT_INSPECTION_FAILED','Cannot inspect a text font');}}
      }
      for(i=0;i<doc.placedItems.length;i++)resource(doc.placedItems[i]);
      for(i=0;i<doc.rasterItems.length;i++)if(doc.rasterItems[i].embedded!==true)resource(doc.rasterItems[i]);
      var mapping=null, mappings=[], named=[], candidates=[], original=null, targets=[], before=[], layouts=[], parents=[];
      function validCode(value){return typeof value==='string'&&/^\\d{2}\\.\\d{4}\\.\\d{3}\\.\\d{7}$/.test(value);}
      function addCandidate(value){for(var c=0;c<candidates.length;c++)if(candidates[c]===value)return;candidates.push(value);}
      for(i=0;i<job.fields.length;i++)if(job.fields[i].sourceKey==='DRAWING_NO') {
        mappings.push(job.fields[i]);
        if(!mapping)mapping=job.fields[i];
      }
      for(i=0;i<frames.length;i++) {
        var text=String(frames[i].contents);
        before.push(text); layouts.push(layout(frames[i])); parents.push(frames[i].parent);
        if(validCode(text))addCandidate(text);
        if(!mapping&&frames[i].name==='DRAWING_NO')named.push(frames[i]);
      }
      if(mapping) {
        for(i=0;i<mappings.length;i++) {
          var found=false;
          for(j=0;j<frames.length;j++)if(frames[j].name===mappings[i].objectName){named.push(frames[j]);found=true;}
          if(!found)issue('AMBIGUOUS_DRAWING_NUMBER','Mapped drawing number object is missing');
        }
      }
      if(mapping||named.length>0) {
        for(i=0;i<named.length;i++) {
          var anchor=String(named[i].contents);
          if(!validCode(anchor))issue('INVALID_ORIGINAL_DRAWING_NUMBER','Mapped text must be an entire valid drawing number');
          else if(original===null)original=anchor;
          else if(original!==anchor)issue('AMBIGUOUS_DRAWING_NUMBER','Drawing number anchors have different original codes');
        }
      } else if(candidates.length===1)original=candidates[0];
      else issue('AMBIGUOUS_DRAWING_NUMBER','Cannot uniquely identify the original drawing number; save a manual mapping');
      if(original!==null) {
        for(i=0;i<frames.length;i++)if(before[i]===original)targets.push(frames[i]);
        inspection.drawingNumber={originalText:original,matches:targets.length};
        for(i=0;i<targets.length;i++)if(!editable(targets[i]))issue('UNEDITABLE_FIELD','A matching drawing number is locked, hidden or not editable');
        inspection.fields.push({objectName:mapping?mapping.objectName:(named.length===1?'DRAWING_NO':''),sourceKey:'DRAWING_NO',required:true,matches:targets.length,editable:!blocking()});
      }
      var value=job.values&&Object.prototype.hasOwnProperty.call(job.values,'DRAWING_NO')?job.values.DRAWING_NO:undefined;
      if(job.mode==='generate'&&!validCode(value))issue('INVALID_VALUE','Replacement must be a complete drawing number');
      if(!blocking()) {
        if(job.mode==='generate') {
          // Equal-length character edits preserve the formatting of each character.
          for(i=0;i<targets.length;i++) {
            if(!targets[i].characters||targets[i].characters.length!==original.length)throw new Error('Cannot preserve character formatting');
            for(j=0;j<original.length;j++)if(original.charAt(j)!==value.charAt(j))targets[i].characters[j].contents=value.charAt(j);
          }
          for(i=0;i<frames.length;i++) {
            var expected=before[i]===original?value:before[i];
            if(String(frames[i].contents)!==expected||frames[i].parent!==parents[i]||layout(frames[i])!==layouts[i])throw new Error('Drawing number replacement verification failed');
          }
          inspection.drawingNumber.replaced=targets.length;
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
