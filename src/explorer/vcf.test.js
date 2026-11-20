import test from 'node:test';
import assert from 'node:assert/strict';
import {readVcf} from './vcf.js';
import {createLocalDataset,importVcfInput} from './dataImport.js';
import {combineDatasets} from './datasets.js';
import {pavCounts,pavState} from './pav.js';
import {parseMaterialCheck} from './materialCheck.js';
import {componentMarker,markerAnnotation,packedCall} from './alleles.js';

const marker={id:'snp101',pos:101,chromosome:'Chr1',ref:'A',alt:'T,C'};
const gene={id:'g1',name:'Gene 1',chromosome:'Chr1',start:80,end:120,model:'model',features:[],
  promoter:{start:80,end:96},variants:[marker],trait_ids:['t1']};
const reference={genes:[gene],traits:[{id:'t1'}]};
const header='##fileformat=VCFv4.3\n##reference=IRGSP-1.0/MSU7\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t';
const metadata={id:'local',name:'Local',version:'1',source:'fixture',genotype_evidence:'G_direct'};

test('marker symbols derive each ALT length change independently',()=>{
  assert.deepEqual(markerAnnotation({ref:'C',alt:'T,G'}),{kind:'SNP',ref:'C',alts:['T','G']});
  assert.deepEqual(markerAnnotation({ref:'C',alt:'CA,CAA'}),{kind:'insertion',ref:'C',alts:['CA (+1 bp)','CAA (+2 bp)']});
  assert.deepEqual(markerAnnotation({ref:'CAT',alt:'C'}),{kind:'deletion',ref:'CAT',alts:['C (−2 bp)']});
  assert.deepEqual(markerAnnotation({ref:'CA',alt:'C,CAA'}),{kind:'mixed',ref:'CA',alts:['C (−1 bp)','CAA (+1 bp)']});
  assert.deepEqual(markerAnnotation({ref:'C',alt:'CA,G'}),{kind:'mixed',ref:'C',alts:['CA (+1 bp)','G']});
});

test('one VCF retains SNP, overlapping InDel, allele indexes and filtered or partial calls',async()=>{
  const vcf=header+'S1\tS2\n1\t101\tsx\tA\tC,T\t.\t.\t.\tGT\t2|1\t0/.\n'+
    '1\t101\tid\tA\tAA\t.\tPASS\t.\tGT:FT\t0/1:PASS\t0/0:LowDP\n'+
    '1\t102\tsv\tA\t<DEL>\t.\tPASS\t.\tGT\t1/1\t0/0\n'+
    '1\t103\tlow\tA\tG\t.\tLowQual\t.\tGT\t1/1\t0/0\n';
  const {patch,provenance,issues}=await importVcfInput(vcf,{},metadata,reference,'test.vcf');
  const bundle=createLocalDataset(patch,{...metadata,provenance},reference);
  assert.deepEqual(bundle.variants.map(v=>v.markerType),['SNP','InDel']);
  assert.equal(bundle.variants[0].id,marker.id);
  assert.deepEqual([...bundle.columns.values()].map(column=>[...column].map(packedCall)),[[[2,1],[0,null]],[[0,1],[null,null]]]);
  assert.deepEqual(issues.map(r=>r.reason),['unsupported_alleles','filtered']);
  assert.equal(provenance.coverage.phased_calls,1);
  assert.equal(componentMarker(bundle.variants,{pos:101,ref:'A',state:'AA'}).markerType,'InDel');
  assert.equal(componentMarker(bundle.variants,{pos:101,ref:'A',state:'A'}),undefined);
});

test('VCF rejects unsafe assembly, duplicate representation and invalid genotype index',()=>{
  const row='1\t101\ts\tA\tT\t.\tPASS\t.\tGT\t0/1\n';
  assert.throws(()=>readVcf(header.replace('IRGSP-1.0/MSU7','other')+'S\n'+row,[gene]),/组装/);
  assert.throws(()=>readVcf(header+'S\n'+row+row,[gene]),/同身份/);
  assert.throws(()=>readVcf(header+'S\n'+row.replace('0/1','0/2'),[gene]),/GT/);
});

test('material check matches allele sequences across ALT order and admits independent PAV',()=>{
  const vcf=header+'S\n1\t101\ts\tA\tC,T\t.\tPASS\t.\tGT\t1|2\n'+
    '1\t103\tnew\tA\tG\t.\tPASS\t.\tGT\t0/0\n';
  const pav='sample_id\tgene_id\tsource_gene_id\tstatus\tmethod\tsource\nS\tg1\tx\tabsent\tcoverage test\ttest source\n';
  const result=parseMaterialCheck([vcf,pav],[marker],'G_direct',[gene]);
  assert.deepEqual(result.calls.get(marker.id),[2,1]);
  assert.equal(result.submitted[1].status,'unknown');
  assert.equal(result.pav[0].status,'absent');
  assert.throws(()=>parseMaterialCheck([vcf,pav.replace('\nS\t','\nS2\t')],[marker],'G_direct',[gene]),/相同/);
});

test('PAV contracts distinguish absent, undetermined, unassayed and published aggregates',()=>{
  const sources=[{id:'assay',role:'pav',release:'1',citation:'fixture',method:'assay'},
    {id:'paper',role:'pav',release:'1',citation:'fixture',method:'published'}];
  const pav='pav_id\tgene_id\tsource_gene_id\tsource_id\tstates\na\tg1\tx\tassay\t10.-\n';
  const pav_summary='pav_id\tgene_id\tsource_gene_id\tsource_id\tpopulation\tpresent\tdenominator\nb\tg1\tx\tpaper\toriginal\t2\t3\n';
  const samples='sample_id\tname\tsource_group\tsubspecies\tregion\tmaterial_type\n'+[1,2,3,4].map(i=>'S'+i+'\tSample\tG\tNA\tNA\taccession').join('\n')+'\n';
  const bundle=createLocalDataset({samples,pav,pav_summary},{...metadata,provenance:{schema:'RiceFlux provenance 1.0',sources}},reference);
  const data=combineDatasets(reference,[bundle]);
  assert.deepEqual(data.individuals.map(s=>pavState(data.pav[0],s)),['present','absent','unknown','unassayed']);
  assert.deepEqual(pavCounts(data.pav[0],data.individuals),{present:1,absent:1,unknown:1,called:2,total:3});
  assert.equal(pavState(data.pav[1],data.individuals[0]),'unassayed');
  assert.throws(()=>createLocalDataset({samples,pav:pav.replace('10.-','10.?')},{...metadata,provenance:{schema:'RiceFlux provenance 1.0',sources}},reference),/状态/);
});
