// Test/trial launcher only. Main process and business behavior remain unchanged.
const { app } = require('electron');
const { prepareTrial } = require('./prepare-trial.cjs');
const trial = prepareTrial(process.env);
app.setPath('userData', trial);
console.log('ISOLATED_DESKTOP_DATA=' + trial);
import('../dist/main/index.js');
