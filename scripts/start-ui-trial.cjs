// Prepare the directory in the parent so Electron relaunch inherits it from startup.
const {spawn}=require('node:child_process');
const {resolve}=require('node:path');
const {prepareTrial}=require('./prepare-trial.cjs');
prepareTrial(process.env);
const root=resolve(__dirname,'..');
const child=spawn(require('electron'),[resolve(root,'isolated-trial.cjs')],{cwd:root,env:{...process.env},stdio:'inherit'});
child.on('exit',code=>process.exit(code??0));
