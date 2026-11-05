// Build temporary test tooling separately; never put fixtures or verifier code in the deliverable.
import path from 'node:path';import {createRequire} from 'node:module';
const [sourceArg,outputArg]=process.argv.slice(2);if(!sourceArg||!outputArg)throw Error('Source and temporary verifier path required');
const source=path.resolve(sourceArg),output=path.resolve(outputArg);
const {build}=createRequire(path.join(source,'package.json'))('esbuild');
await build({entryPoints:[path.join(source,'scripts/verify-comprehensive-database.ts')],outfile:output,bundle:true,platform:'node',format:'esm',target:'node24',plugins:[{name:'verification-native-sqlite',setup(build){build.onResolve({filter:/^better-sqlite3$/},args=>args.namespace==='verification-native'?{path:'better-sqlite3',external:true}:{path:'better-sqlite3',namespace:'verification-native'});build.onLoad({filter:/.*/,namespace:'verification-native'},()=>({contents:"export default require('better-sqlite3');",loader:'js'}));}}],nodePaths:[path.join(source,'node_modules')],banner:{js:"import {createRequire as __verificationRequire} from 'node:module';const require=__verificationRequire(import.meta.url);"},logLevel:'warning'});
console.log(JSON.stringify({temporaryVerifier:output}));
