import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'vite';
import {geneCatalogPath} from '../src/explorer/geneCatalog.js';
import {coveragePath} from '../src/explorer/geneCoverage.js';

const [output,...args]=process.argv.slice(2);
const overlay=args.find(value=>value.startsWith('--datasets='));
const audience=args.find(value=>/^--audience=(researcher|breeder)$/.test(value));
const flag=args.includes('--keep-source-tables')?'--keep-source-tables':null;
if(!output||args.some(value=>value!==overlay&&value!==audience&&value!==flag))throw Error('Usage: npm run build:packed -- <new site dir> [--keep-source-tables] [--datasets=/path/to/staged/datasets] [--audience=researcher|breeder]');
const root=path.resolve(import.meta.dirname,'..'),outDir=path.resolve(output),source=path.join(root,'public');
if(outDir.startsWith(source+path.sep))throw Error('Choose a site directory outside public/');
fs.mkdirSync(outDir);
const datasetRoot=overlay?path.resolve(overlay.slice('--datasets='.length)):path.join(source,'datasets');
const receipt=execFileSync(process.execPath,[path.join(import.meta.dirname,'pack-datasets.mjs'),datasetRoot,path.join(outDir,'datasets'),...(flag?[flag]:[])],{encoding:'utf8'});
for(const entry of fs.readdirSync(source)){
  if(entry!=='datasets'&&entry!=='.DS_Store')fs.cpSync(path.join(source,entry),path.join(outDir,entry),{recursive:true});
}
const deploymentFile=path.join(outDir,'formats/deployment.json');
const deployment=JSON.parse(fs.readFileSync(deploymentFile,'utf8'));
if(fs.existsSync(path.join(outDir,'datasets',geneCatalogPath)))deployment.gene_catalog=geneCatalogPath;
else delete deployment.gene_catalog;
deployment.catalog_coverage=coveragePath;
fs.writeFileSync(deploymentFile,JSON.stringify(deployment,null,2)+'\n');
await build({root,mode:audience?.slice('--audience='.length)??'production',configLoader:'native',publicDir:false,build:{outDir,emptyOutDir:false},logLevel:'warn'});
fs.closeSync(fs.openSync(path.join(outDir,'.nojekyll'),'a'));
process.stdout.write(receipt);
