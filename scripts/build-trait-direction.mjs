import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {readTable} from '../src/explorer/datasets.js';
import {writeTSV} from '../src/explorer/formats.js';
import {traitConcept,traitVocabulary} from '../src/explorer/traitVocabulary.js';
import {parseAlleleFunction,directionLabels} from '../src/explorer/alleleDirection.js';

if(!process.argv[2])throw Error('Usage: node scripts/build-trait-direction.mjs <RiceNavi website JSON>');
const current=JSON.parse(readFileSync(process.argv[2],'utf8')).data.contents;
const reviewDir=new URL('../public/formats/function-review/',import.meta.url);
const read=name=>readTable(readFileSync(new URL(name,reviewDir),'utf8')).objects();
function write(name,rows){
  writeFileSync(new URL(name,reviewDir),writeTSV(Object.keys(rows[0]),rows));
}
function normalized(trait,direction,sign,context='',state='',status='mapped'){
  return {
    trait_concept_id:trait?.id, trait_zh:trait?.zh, trait_en:trait?.en,
    direction_term:direction, direction_label_zh:directionLabels[direction], effect_sign:sign,
    direction_context:context, qualitative_state:state, normalization_status:status,
  };
}
const audited=read('ricenavi_alt_audit.txt');
assert.equal(current.length,audited.length);
const sourceFields={
  gene:'Gene',chr:'Chr',position:'Pos_7.0',ref:'Ref_geno',alt:'Alt_geno',
  source_msu:'MSU_ID',source_rap:'RAP ID',category:'Category',rice_navi_alt_function:'Alt_Allele_Function',
};
const website=audited.flatMap((row,i)=>{
  assert.equal(row.website_row,String(i+2));
  for(const [field,key] of Object.entries(sourceFields)) {
    assert.equal(row[field],String(current[i][key]??''),`RiceNavi row ${i+2}, field ${key}`);
  }
  return parseAlleleFunction(row.rice_navi_alt_function).map(item=>({
    ...row,...normalized(traitConcept(item.trait),item.direction,item.sign,item.context,item.state,item.status),
  }));
});
const prior=read('effect_direction.txt').map(row=>{
  const trait=traitConcept(row.trait_id)??traitConcept(row.trait);
  assert.ok(['increase','decrease'].includes(row.direction),row.effect_id);
  const direction=row.direction==='increase'?'increase':'reduce';
  return {...row,...normalized(trait,direction,row.direction,row.condition,'',trait?'mapped':'trait_unresolved')};
});
for(const rows of [website,prior])assert.ok(rows.length);
write('ricenavi_direction_normalized.txt',website);
write('effect_direction_normalized.txt',prior);
write('../trait-vocabulary.v1.txt',traitVocabulary.traits.map(trait=>({...trait,aliases:trait.aliases.join(' | ')})));

const count=(rows,key)=>Object.fromEntries([...new Set(rows.map(row=>row[key]))].sort()
  .map(value=>[value,rows.filter(row=>row[key]===value).length]));
console.log(JSON.stringify({
  website_rows:current.length, website_comparisons:count(audited,'comparison_status'),
  website_normalized_rows:website.length, website_normalization:count(website,'normalization_status'),
  literature_rows:prior.length, literature_normalization:count(prior,'normalization_status'), literature_signs:count(prior,'effect_sign'),
  trait_concepts:count(traitVocabulary.traits,'scope')
},null,2));
