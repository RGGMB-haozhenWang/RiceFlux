export const introgressionColumns=[
  'schema_version','analysis_id','source_ref','contrast','assembly','gene_id','haplotype_id',
  'recurrent_parent','donor_parent','family_id','trial_id','trial_label','trait_id','trait_label','unit',
  'genotype_evidence','status','estimate','ci_lower','ci_upper','n_donor','n_recurrent','next_check',
];

const contrast='donor_vs_recurrent_within_family';
const evidence=new Set(['G_direct','G_chip','G_projected','G_mixed']);
const statuses=new Set(['estimated','not_estimable','not_measured']);
const numeric=['estimate','ci_lower','ci_upper','n_donor','n_recurrent'];
const caseAxes=['analysis_id','source_ref','contrast','assembly','gene_id','haplotype_id',
  'recurrent_parent','donor_parent','family_id','trial_id','genotype_evidence'];
export const introgressionCaseKey=row=>JSON.stringify(caseAxes.map(key=>row[key]));

function validHaplotype(row) {
  let id;
  try{id=JSON.parse(row.haplotype_id);}catch{return false;}
  if(!Array.isArray(id)||id.length!==4||JSON.stringify(id)!==row.haplotype_id)return false;
  // A qualified source definition remains scoped to its frozen analysis and source.
  if(id[0]==='source_scoped')return id[1]===row.analysis_id&&id[2]===row.source_ref&&
    typeof id[3]==='string'&&Boolean(id[3].trim())&&id[3]===id[3].trim();
  const [gene,assembly,chromosome,vector]=id;
  if(gene!==row.gene_id||assembly!==row.assembly||!Number.isInteger(chromosome)||chromosome<1||chromosome>12||
    !Array.isArray(vector)||!vector.length)return false;
  const keys=[];
  for(const entry of vector){
    if(!Array.isArray(entry)||entry.length!==2)return false;
    const [key,state]=entry;
    if(typeof key!=='string'||typeof state!=='string'||!/^([1-9]\d*):[ACGT]{1,51}:(SNP|InDel)$/.test(key)||
      !Number.isSafeInteger(Number(key.split(':')[0]))||!/^[ACGT]{1,51}$/.test(state))return false;
    const [,ref,kind]=key.split(':');
    if(kind==='SNP'&&(ref.length!==1||state.length!==1))return false;
    keys.push(key);
  }
  return new Set(keys).size===keys.length&&keys.every((key,i)=>!i||keys[i-1].localeCompare(key,'en')<0);
}

function validEstimate(row) {
  return row.status==='estimated'&&['estimate','ci_lower','ci_upper'].every(key=>Number.isFinite(row[key]))&&
    row.ci_lower<=row.estimate&&row.estimate<=row.ci_upper&&
    ['n_donor','n_recurrent'].every(key=>Number.isSafeInteger(row[key])&&row[key]>0);
}

export function parseIntrogressionReview(text) {
  if(typeof text!=='string'||text.includes('\uFFFD')||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
    throw Error('Introgression review must be UTF-8 tab-delimited text');
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
  if(lines.at(-1)==='')lines.pop();
  if(lines.shift()!==introgressionColumns.join('\t'))throw Error('Introgression review header must match schema 1 exactly');
  if(!lines.length)throw Error('Introgression review has no endpoint rows');
  const seen=new Set(),metadata=new Map();
  const bind=(key,value,fail)=>{
    const encoded=JSON.stringify(value);
    if(metadata.has(key)&&metadata.get(key)!==encoded)fail('conflicting endpoint or case axes');
    metadata.set(key,encoded);
  };
  return lines.map((line,index)=>{
    const fail=message=>{throw Error(`Introgression review row ${index+2}: ${message}`);};
    const values=line.split('\t');
    if(values.length!==introgressionColumns.length)fail('wrong column count');
    if(values.some(value=>value!==value.trim()||value.includes('\r')))fail('unexpected whitespace');
    const row=Object.fromEntries(introgressionColumns.map((key,i)=>[key,values[i]]));
    for(const key of introgressionColumns.filter(key=>!numeric.includes(key)&&key!=='next_check'))
      if(!row[key])fail(`missing ${key}`);
    if(row.schema_version!=='1'||row.contrast!==contrast||!statuses.has(row.status)||!evidence.has(row.genotype_evidence))
      fail('invalid schema_version, contrast, status or genotype_evidence');
    if(row.recurrent_parent===row.donor_parent)fail('donor and recurrent parent must differ');
    if(!validHaplotype(row))fail('haplotype_id must be a stable coordinate signature or qualified source_scoped ID');
    for(const key of numeric){
      const value=row[key];
      if(value!==''&&!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))fail(`invalid ${key}`);
      row[key]=value===''?null:Number(value);
      if(row[key]!==null&&!Number.isFinite(row[key]))fail(`nonfinite ${key}`);
    }
    for(const key of ['n_donor','n_recurrent'])
      if(row[key]!==null&&(!Number.isSafeInteger(row[key])||row[key]<0))fail(`invalid ${key}`);
    if(row.status==='estimated'?!validEstimate(row):['estimate','ci_lower','ci_upper'].some(key=>row[key]!==null))
      fail('estimated endpoints require ordered estimate/CI and positive group counts; other statuses require blank estimates');
    const caseKey=introgressionCaseKey(row),endpoint=JSON.stringify([caseKey,row.trait_id]);
    if(seen.has(endpoint))fail('duplicate case endpoint');
    seen.add(endpoint);
    // Evidence class cannot create a second copy of the same biological endpoint.
    const biologicalKey=JSON.stringify(caseAxes.filter(key=>key!=='genotype_evidence').map(key=>row[key]));
    bind(JSON.stringify(['evidence',biologicalKey,row.trait_id]),row.genotype_evidence,fail);
    bind(JSON.stringify(['trial',row.analysis_id,row.source_ref,row.trial_id]),row.trial_label,fail);
    bind(JSON.stringify(['trait',row.analysis_id,row.source_ref,row.trait_id]),[row.trait_label,row.unit],fail);
    bind(JSON.stringify(['family',row.analysis_id,row.source_ref,row.family_id]),[row.recurrent_parent,row.donor_parent],fail);
    return row;
  });
}

export function evaluateIntrogression(target,tradeoff,{minGain,maxCost}={}) {
  if(!Number.isFinite(minGain)||(maxCost!==undefined&&!Number.isFinite(maxCost)))return 'awaiting_goal';
  if(!target||!validEstimate(target)||target.contrast!==contrast||!evidence.has(target.genotype_evidence)||
    caseAxes.some(key=>typeof target[key]!=='string'||!target[key]))return 'insufficient';
  if(maxCost!==undefined&&(!tradeoff||!validEstimate(tradeoff)||
    introgressionCaseKey(target)!==introgressionCaseKey(tradeoff)||target.trait_id===tradeoff.trait_id))return 'insufficient';
  if(target.ci_upper<minGain||(maxCost!==undefined&&tradeoff.ci_lower>maxCost))return 'outside';
  if(target.ci_lower<minGain||(maxCost!==undefined&&tradeoff.ci_upper>maxCost))return 'uncertain';
  return 'supported';
}
