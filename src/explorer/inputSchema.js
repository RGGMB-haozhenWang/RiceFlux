import contract from '../../public/formats/dataset-intake.json' with { type: 'json' };

export const datasetIntake=contract;
export const manifestNames=contract.profiles.package.manifestNames;
export function registeredManifestPath(value) {
  const [directory,name,...extra]=value.split('/');
  return extra.length===0&&/^[-\w]+$/.test(directory)&&manifestNames.includes(name);
}

const portableContext=contract.manifestContext;
const pathSegment=value=>encodeURIComponent(value).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const datasetIri=(id,version)=>contract.datasetIriPrefix+pathSegment(id)+'/'+pathSegment(version);
function matchesContext(context) {
  if(!context||typeof context!=='object'||Array.isArray(context)||
    Object.keys(context).length!==Object.keys(portableContext).length)return false;
  return Object.entries(portableContext).every(([key,value])=>{
    const actual=context[key];
    if(typeof value==='string')return actual===value;
    return actual&&typeof actual==='object'&&Object.keys(actual).length===2&&
      actual['@id']===value['@id']&&actual['@type']===value['@type'];
  });
}

export function manifestFields(document) {
  if(!document||typeof document!=='object'||Array.isArray(document))throw Error('数据集清单应是 JSON 对象');
  const {'@context':context,'@type':type,'@id':identity,...manifest}=document;
  if(context!==undefined||type!==undefined||identity!==undefined){
    if(type!==contract.manifestType||identity!==datasetIri(manifest.id,manifest.version)||!matchesContext(context))
      throw Error('JSON-LD 清单须使用 RiceFlux DatasetVersion 的上下文与类型');
  }
  return manifest;
}

export function semanticManifest(manifest) {
  const {'@context':context,'@type':type,'@id':identity,...fields}=manifest;
  const {id,version}=fields;
  return {'@context':portableContext,'@id':datasetIri(id,version),
    '@type':contract.manifestType,...fields};
}

export function validateTablePairs(keys) {
  if(contract.pairedTables.some(([first,second])=>keys.includes(first)!==keys.includes(second)))
    throw Error('variants 与 genotypes、environments 与 phenotypes 须分别成对提供');
}
