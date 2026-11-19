import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'vite';

const [output,flag]=process.argv.slice(2);
if(!output||flag&&flag!=='--keep-source-tables')throw Error('Usage: npm run build:packed -- <new site dir> [--keep-source-tables]');
const root=path.resolve(import.meta.dirname,'..'),outDir=path.resolve(output),source=path.join(root,'public');
if(outDir.startsWith(source+path.sep))throw Error('Choose a site directory outside public/');
fs.mkdirSync(outDir);
const receipt=execFileSync(process.execPath,[path.join(import.meta.dirname,'pack-datasets.mjs'),path.join(source,'datasets'),path.join(outDir,'datasets'),...(flag?[flag]:[])],{encoding:'utf8'});
for(const entry of fs.readdirSync(source)){
  if(entry!=='datasets'&&entry!=='.DS_Store')fs.cpSync(path.join(source,entry),path.join(outDir,entry),{recursive:true});
}
await build({root,configLoader:'native',publicDir:false,build:{outDir,emptyOutDir:false},logLevel:'warn'});
fs.closeSync(fs.openSync(path.join(outDir,'.nojekyll'),'a'));
process.stdout.write(receipt);
