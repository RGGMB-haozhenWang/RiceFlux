import test from 'node:test';
import assert from 'node:assert/strict';
import {alleleNames,markerKind} from './alleles.js';
import {createLocalDataset,extendDataset} from './dataImport.js';
import {combineDatasets,parseDataset,readTable} from './datasets.js';
import {geneTables} from './exports.js';
import {geneSchemes,jointCalls,typeMaterial} from './jointHaplotypes.js';
import {alleleStats,gtToken,validateDataset} from './model.js';
import {callOf} from './catalog.js';

const gene={id:'LOC_Os01g00010',name:'Test locus',chromosome:'Chr1',start:1,end:100,
  assembly:'IRGSP-1.0/MSU7',model:'fixture',promoter:{start:1,end:9},features:[],variants:[],records:[],trait_ids:['fixture']};
const reference={meta:{},genes:[gene],traits:[{id:'fixture',name:'Test trait',family:'fixture',category:'Test'}]};
const meta={id:'indel',name:'Synthetic InDel',version:'1',source:'Synthetic test only',genotype_evidence:'G_direct'};
const manifest={...meta,schema:'RiceFlux tables 1.2',assembly:'IRGSP-1.0/MSU7'};
const txt=(fields,rows)=>[fields,...rows].map(row=>row.join('\t')).join('\n')+'\n';
const samples=txt(['sample_id','name','source_group','subspecies','region','material_type'],
  ['S1','S2','S3','S4'].map(id=>[id,id,'Group I','indica','NA','breeding line']));
const fields=['marker_id','gene_id','chr','position','ref','alt'];
const env=txt(['environment_id','trait_id','trait_name','unit','category','family','assay','site','year'],[]);
const phenotypes=txt(['sample_id'],[]);
const patch={samples,variants:txt(fields,[['ins',gene.id,'Chr1',10,'A','AA'],['del',gene.id,'Chr1',12,'AT','A,ATT']]),
  genotypes:txt(['sample_id','ins','del'],[['S1','1/1','1/1'],['S2','A/A','ATT/ATT'],['S3','A/AA','1/2'],['S4','AA/.','NA']])};

test('Tables 1.2 validates short insertions and deletions without coercing older SNP schemas',()=>{
  for(const schema of ['RiceFlux tables 1.0','RiceFlux tables 1.1']){
    assert.throws(()=>parseDataset({...manifest,schema},{...patch,environments:env,phenotypes},reference),/短 InDel/);
  }
  const parsed=createLocalDataset(patch,meta,reference);
  assert.deepEqual(parsed.variants.map(v=>v.markerType),['InDel','InDel']);
  assert.equal(markerKind(['AT','A','ATT'],true),'InDel');
  assert.equal(markerKind(['A','AT','AC','AG','AA'],true),null);
  assert.equal(markerKind(['AT','TC'],true),null);
  assert.equal(markerKind(['A','A'.repeat(52)],true),null);
  assert.throws(()=>createLocalDataset({...patch,genotypes:patch.genotypes.replace('1/2','2/3')},meta,reference),/REF\/ALT/);
  const phenotypeOnly=createLocalDataset({samples,environments:env,phenotypes},{...meta,version:'0'},reference);
  const added=extendDataset(phenotypeOnly,'genotypes',patch,meta,reference);
  assert.equal(added.manifest.schema,'RiceFlux tables 1.2');
  assert.deepEqual(added.variants.map(v=>v.markerType),['InDel','InDel']);
});

test('region calls, combination membership, Missing/MAF and export retain whole indel sequences',()=>{
  const data=validateDataset(combineDatasets(reference,[createLocalDataset(patch,meta,reference)]));
  const g=data.genes[0],samples=data.individuals,scheme=geneSchemes(g,{events:{}})[0];
  assert.deepEqual(samples.map(s=>typeMaterial(s,scheme).status),['called','called','heterozygous','missing']);
  const joint=jointCalls(samples,[scheme]);
  assert.equal(joint.assigned,2);
  assert.deepEqual(new Set(joint.groups.map(r=>r.labels[0])),new Set(['标记型 AA·A','标记型 A·ATT']));
  const stats=alleleStats(samples,g.variants[0]);
  assert.deepEqual([stats.called,stats.complete,stats.missing,stats.maf],[7,3,1/8,3/7]);
  const tables=geneTables(data,g,samples,g.variants,{minMaf:0,maxMissing:1});
  assert.deepEqual(readTable(tables['variants.tsv']).objects().map(r=>[r.marker_type,r.ref,r.alt]),
    [['InDel','A','AA'],['InDel','AT','A,ATT']]);
  assert.deepEqual(readTable(tables['genotypes.tsv']).objects().map(r=>[r.ins,r.del]),
    [['AA/AA','A/A'],['A/A','ATT/ATT'],['A/AA','A/ATT'],['AA/.','./.']]);
});

test('when datasets order ALT differently, calls remap by full allele sequence',()=>{
  const first=createLocalDataset(patch,meta,reference);
  const reordered={...patch,variants:patch.variants.replace('AT\tA,ATT','AT\tATT,A'),
    genotypes:patch.genotypes.replace('S1\t1/1\t1/1','S1\t1/1\t2/2')};
  const second=createLocalDataset(reordered,{...meta,id:'indel_reverse'},reference);
  const data=validateDataset(combineDatasets(reference,[first,second]));
  const deletion=data.genes[0].variants[1];
  assert.deepEqual(alleleNames(deletion),['AT','A','ATT']);
  assert.equal(deletion.markerType,'InDel');
  assert.deepEqual([0,4].map(index=>gtToken(callOf(data.individuals[index],deletion),deletion)),['A/A','A/A']);
});
