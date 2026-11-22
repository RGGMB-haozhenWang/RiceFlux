import test from 'node:test';
import assert from 'node:assert/strict';
import {introgressionColumns,parseIntrogressionReview,evaluateIntrogression,introgressionCaseKey} from './introgressionReview.js';

const base={schema_version:'1',analysis_id:'pilot-v1',source_ref:'frozen:analysis-v1',
  contrast:'donor_vs_recurrent_within_family',assembly:'IRGSP-1.0/MSU7',gene_id:'LOC_Os01g00010',
  haplotype_id:JSON.stringify(['LOC_Os01g00010','IRGSP-1.0/MSU7',1,[['100:A:SNP','G']]]),
  recurrent_parent:'recurrent',donor_parent:'donor',family_id:'family-1',trial_id:'trial-1',trial_label:'Trial 1',
  trait_id:'yield',trait_label:'Yield',unit:'g/plant',genotype_evidence:'G_projected',status:'estimated',
  estimate:'3',ci_lower:'2',ci_upper:'4',n_donor:'12',n_recurrent:'13',next_check:''};
const table=(...patches)=>introgressionColumns.join('\t')+'\n'+patches.map(patch=>{
  const row={...base,...patch};
  return introgressionColumns.map(key=>row[key]??'').join('\t');
}).join('\n')+'\n';
const parse=patch=>parseIntrogressionReview(table(patch))[0];
const tradeoff={trait_id:'height',trait_label:'Height',unit:'cm',estimate:'2',ci_lower:'1',ci_upper:'3'};

test('strict TXT accepts BOM/CRLF, keeps provenance and signed estimates without mutating text',()=>{
  const text='\uFEFF'+table({estimate:'-2',ci_lower:'-4',ci_upper:'-1'}).replaceAll('\n','\r\n');
  const [row]=parseIntrogressionReview(text);
  assert.equal(row.estimate,-2);
  assert.equal(row.n_donor,12);
  assert.equal(row.genotype_evidence,'G_projected');
  assert.equal(row.schema_version,'1');
  assert.equal(row.next_check,'');
  for(const label of ['G_direct','G_chip','G_mixed'])assert.equal(parse({genotype_evidence:label}).genotype_evidence,label);
});

test('missing endpoints stay missing, including unknown counts and negative results',()=>{
  for(const status of ['not_estimable','not_measured']){
    const row=parse({status,estimate:'',ci_lower:'',ci_upper:'',n_donor:'',n_recurrent:'0',next_check:'Measure endpoint'});
    assert.equal(row.estimate,null);
    assert.equal(row.ci_lower,null);
    assert.equal(row.n_donor,null);
    assert.equal(row.n_recurrent,0);
    assert.equal(evaluateIntrogression(row,undefined,{minGain:1}),'insufficient');
  }
});

test('qualified source IDs are bound to analysis and source; bare labels and malformed signatures fail',()=>{
  const scoped=JSON.stringify(['source_scoped',base.analysis_id,base.source_ref,'NAM:CDS-promoter-v1:signature']);
  assert.equal(parse({haplotype_id:scoped}).haplotype_id,scoped);
  const invalid=['Hap1',JSON.stringify(['source_scoped','wrong',base.source_ref,'Hap1']),
    JSON.stringify(['source_scoped',base.analysis_id,'wrong','Hap1']),
    JSON.stringify(['other',base.assembly,1,[['100:A:SNP','G']]]),
    JSON.stringify([base.gene_id,'other',1,[['100:A:SNP','G']]]),
    JSON.stringify([base.gene_id,base.assembly,1,[]]),
    JSON.stringify([base.gene_id,base.assembly,1,[['100:A:SNP','G'],['100:A:SNP','T']]]),
    JSON.stringify([base.gene_id,base.assembly,1,[['100:A:SNP','GG']]]),
    JSON.stringify(JSON.parse(base.haplotype_id),null,1).replaceAll('\n','')];
  for(const haplotype_id of invalid)assert.throws(()=>parse({haplotype_id}),/haplotype_id/);
});

test('header, row widths, enums, numbers, uncertainty and sample sizes fail closed',()=>{
  assert.throws(()=>parseIntrogressionReview(table({}).replace('schema_version','schema')),/header/);
  assert.throws(()=>parseIntrogressionReview(introgressionColumns.join('\t')+'\n'),/no endpoint/);
  assert.throws(()=>parseIntrogressionReview(table({})+'\n'),/column count/);
  assert.throws(()=>parseIntrogressionReview(table({}).replace(/\n$/,'\textra\n')),/column count/);
  const invalid=[{schema_version:'2'},{contrast:'between_parents'},{genotype_evidence:'G_inferred'},
    {status:'significant'},{trial_id:''},{unit:''},{source_ref:' source'},
    {estimate:'NaN'},{estimate:'Infinity'},{estimate:'0x10'},{estimate:'1e999'},
    {ci_lower:'4'},{ci_upper:'2'},{ci_lower:''},{n_donor:'0'},{n_donor:'1.5'},
    {n_donor:'-1'},{n_recurrent:''},{n_recurrent:'9007199254740992'},
    {status:'not_measured'},{donor_parent:base.recurrent_parent}];
  for(const patch of invalid)assert.throws(()=>parse(patch),/Introgression review/);
  assert.throws(()=>parseIntrogressionReview(table({next_check:'bad\u0000'})),/UTF-8/);
});

test('duplicate endpoints and conflicting family, trial or trait definitions are rejected',()=>{
  assert.throws(()=>parseIntrogressionReview(table({},{})),/duplicate/);
  assert.throws(()=>parseIntrogressionReview(table({},{genotype_evidence:'G_chip'})),/conflicting/);
  for(const patch of [{...tradeoff,recurrent_parent:'other'},{...tradeoff,trial_label:'other'},
    {trial_id:'trial-2',unit:'kg'},{trial_id:'trial-2',trait_label:'Other yield'}])
    assert.throws(()=>parseIntrogressionReview(table({},patch)),/conflicting/);
  assert.equal(parseIntrogressionReview(table({},tradeoff)).length,2);
  assert.equal(parseIntrogressionReview(table({},{trial_id:'trial-2',trial_label:'Trial 2'})).length,2);
});

test('goals are explicit and support requires whole closed confidence intervals',()=>{
  const target=parse({}),cost=parse(tradeoff);
  assert.equal(evaluateIntrogression(target,cost),'awaiting_goal');
  assert.equal(evaluateIntrogression(target,cost,{minGain:NaN}),'awaiting_goal');
  assert.equal(evaluateIntrogression(target,cost,{minGain:1,maxCost:Infinity}),'awaiting_goal');
  assert.equal(evaluateIntrogression(target,undefined,{minGain:2}),'supported');
  assert.equal(evaluateIntrogression(target,cost,{minGain:2,maxCost:3}),'supported');
  assert.equal(evaluateIntrogression(target,cost,{minGain:3,maxCost:3}),'uncertain');
  assert.equal(evaluateIntrogression(target,cost,{minGain:1,maxCost:2}),'uncertain');
  assert.equal(evaluateIntrogression(target,cost,{minGain:5,maxCost:3}),'outside');
  assert.equal(evaluateIntrogression(target,cost,{minGain:1,maxCost:0}),'outside');
  assert.equal(evaluateIntrogression(target,undefined,{minGain:1,maxCost:3}),'insufficient');
  assert.equal(evaluateIntrogression(parse({estimate:'0',ci_lower:'-1',ci_upper:'1'}),undefined,{minGain:0}),'uncertain');
  assert.equal(evaluateIntrogression(parse({estimate:'-2',ci_lower:'-3',ci_upper:'-1'}),undefined,{minGain:0}),'outside');
  assert.equal(target.genotype_evidence,'G_projected');
});

test('comparisons require exact matching axes and a distinct measured trade-off endpoint',()=>{
  const target=parse({}),cost=parse(tradeoff);
  assert.equal(introgressionCaseKey(target),introgressionCaseKey(cost));
  for(const key of ['analysis_id','source_ref','contrast','assembly','gene_id','haplotype_id',
    'recurrent_parent','donor_parent','family_id','trial_id','genotype_evidence']){
    const other={...cost,[key]:'other'};
    assert.notEqual(introgressionCaseKey(target),introgressionCaseKey(other));
    assert.equal(evaluateIntrogression(target,other,{minGain:1,maxCost:3}),'insufficient',key);
  }
  assert.equal(evaluateIntrogression(target,target,{minGain:1,maxCost:3}),'insufficient');
  assert.equal(evaluateIntrogression(target,{...cost,status:'not_measured'},{minGain:1,maxCost:3}),'insufficient');
  assert.equal(evaluateIntrogression(undefined,cost,{minGain:1}),'insufficient');
});
