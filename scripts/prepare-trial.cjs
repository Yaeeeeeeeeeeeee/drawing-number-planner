const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
function inside(root, value) {
  const relative=path.relative(root,path.resolve(value));
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}
function canonical(value) {
  let current=path.resolve(value);
  const missing=[];
  while(!fs.existsSync(current)){
    const parent=path.dirname(current);
    if(parent===current)throw Error('Cannot resolve trial path');
    missing.unshift(path.basename(current));current=parent;
  }
  return path.join(fs.realpathSync.native(current),...missing);
}
function validateDirectory(directory,prefix) {
  const resolved=fs.realpathSync.native(directory);
  if (!inside(fs.realpathSync.native(os.tmpdir()),resolved) || !path.basename(resolved).startsWith(prefix)) throw Error('Not an isolated temporary directory');
  return resolved;
}
function validateSettings(directory) {
  const file=path.join(directory,'settings.json');
  const settings=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
  for(const key of ['workspaceRoot','outboundOutputRoot']) {
    if(settings[key])settings[key]=canonical(settings[key]);
    if(settings[key] && !inside(directory,settings[key]))throw Error(key+' outside isolated directory');
    if(settings[key] && fs.existsSync(settings[key]) && !inside(directory,fs.realpathSync.native(settings[key])))throw Error(key+' outside isolated directory');
  }
  return settings;
}
function rejectLinks(directory) {
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
    const file=path.join(directory,entry.name);
    if(fs.lstatSync(file).isSymbolicLink())throw Error('Symbolic links are not allowed in trial samples');
    if(entry.isDirectory())rejectLinks(file);
  }
}
function prepareTrial(env) {
  if(env.PLANNER_TRIAL_CURRENT) {
    const current=validateDirectory(env.PLANNER_TRIAL_CURRENT,'planner-ui-desktop-trial-');
    if(!fs.existsSync(path.join(current,'.planner-ui-trial')))throw Error('Missing trial marker');
    validateSettings(current);
    return current;
  }
  if(!env.PLANNER_TRIAL_SAMPLE)throw Error('Missing isolated sample');
  const sample=validateDirectory(env.PLANNER_TRIAL_SAMPLE,'planner-second-acceptance-preview-');
  if(!fs.existsSync(path.join(sample,'planner.db')))throw Error('Missing sample database');
  rejectLinks(sample);
  const settings=validateSettings(sample);
  const trial=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'planner-ui-desktop-trial-')));
  fs.cpSync(sample,trial,{recursive:true});
  if(settings.workspaceRoot)settings.workspaceRoot=path.join(trial,path.relative(sample,settings.workspaceRoot));
  settings.outboundOutputRoot=path.join(trial,'outbound');
  fs.mkdirSync(settings.outboundOutputRoot,{recursive:true});
  fs.writeFileSync(path.join(trial,'settings.json'),JSON.stringify(settings));
  fs.writeFileSync(path.join(trial,'.planner-ui-trial'),'isolated trial');
  env.PLANNER_TRIAL_CURRENT=trial;
  return trial;
}
module.exports={prepareTrial};
