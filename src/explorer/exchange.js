import {columns,formats,namespace} from './formats.js';
import {alleleStats} from './model.js';
// IRGSP-1.0/MSU7 reference FASTA index, chromosomes 1 through 12.
export const lengths = [0,43270923,35937250,36413819,35502694,29958434,31248787,29697621,28443022,23012720,23207287,29021106,27531856];
export function chromNum(label) {
  const match = /^(?:chr)?0*(\d+)$/i.exec(label ?? '');
  return match ? Number(match[1]) : 0;
}
const missing = x => !x || x === 'NA' || x === '.';
export function readPrior(text) {
  const lines = text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  const header = lines.shift()?.split('\t') ?? [];
  const extended = [...columns,...formats.priorTable.optionalColumns];
  if (![columns,extended].some(keys => keys.join('\t')===header.join('\t')))
    throw Error('请使用模板八列，可在末尾追加 Source_DOI');
  if (!lines.length) throw Error('文件缺少数据行');
  return lines.map((line,index) => {
    const cells = line.split('\t');
    const invalid = message => {throw Error('第 '+(index+2)+' 行：'+message);};
    if (cells.length!==header.length || missing(cells[0].trim())) invalid('需要与表头相同的列数和基因名 QTG');
    const row=Object.fromEntries(header.map((k,i)=>[k,cells[i].trim()]));
    const inputDOI = missing(row.Source_DOI) ? [] : row.Source_DOI.split(/\s+/).map(d => d.replace(/^https?:\/\/doi\.org\//i,''));
    if (inputDOI.some(d => !/^10\.\d{4,9}\/\S+$/.test(d))) invalid('Source_DOI 请填写 DOI 或 doi.org 链接，多个来源用空格分隔');
    const chromosome=chromNum(row.Chr);
    if (!missing(row.Chr) && !lengths[chromosome]) invalid('Chr 需为水稻染色体 1–12');
    const positions=row.Position.split(',').map(x=>x.trim());
    const refs=row.Ref.split(',').map(x=>x.trim());
    if (!missing(row.Ref) && positions.length!==refs.length) invalid('Ref 应与 Position 逐项对应');
    const sites=positions.map((v,j)=>{
      const ref=missing(row.Ref)||missing(refs[j])?null:refs[j].toUpperCase();
      if (ref && !/^[ACGTN]+$/.test(ref)) invalid('Ref 应为正链参考序列或 NA');
      if (missing(v)) return {pos:null,ref};
      const pos=Number(v);
      if (!/^\d+$/.test(v)||!Number.isSafeInteger(pos)||!lengths[chromosome]||pos<1||pos>lengths[chromosome]) invalid('Position 超出参考染色体或缺少 Chr');
      return {pos,ref};
    });
    return {row,sites,chromosome,line:index+2,inputDOI:[...new Set(inputDOI)]};
  });
}
export function resolvePrior(record,genes) {
  const row=record.row, normalize=s=>String(s??'').trim().toLowerCase();
  const byName=genes.filter(g=>[g.name,g.id,...(g.catalog?.aliases||[])].flatMap(s=>s.split(/[;；/]/).concat(s)).some(s=>normalize(s)===normalize(row.QTG)));
  const byId=missing(row.MSU_ID)?[]:genes.filter(g=>[g.id,g.catalog?.msu,g.catalog?.sourceId].includes(row.MSU_ID));
  if(!missing(row.MSU_ID)) {
    if(byId.length!==1 || (byName.length && !byName.includes(byId[0])))return null;
    return byId[0];
  }
  return byName.length===1?byName[0]:null;
}
export function matchMarker(gene,record,site) {
  if(!gene || !site.pos || !site.ref || chromNum(gene.chromosome)!==record.chromosome)return null;
  return gene.variants.find(v=>v.pos===site.pos && v.ref===site.ref)??null;
}

export function bindPrior(records, genes) {
  return records.map(record => ({...record, gene:resolvePrior(record, genes)}));
}

function markerSummary(gene, marker, status, cohort, evidence) {
  const stats = marker && alleleStats(cohort, marker);
  const site = evidence.sites[marker?.id];
  const siteKey = marker && (marker.classified
    ? 'marker_' + marker.id
    : 'site_' + gene.chromosome + '_' + marker.pos + '_' + marker.ref);
  return {
    Matched_gene:gene?.id, Marker:marker?.id, Status:status, N_samples:cohort.length,
    REF_copies:stats?.ref, ALT_copies:stats?.alt, Called_copies:stats?.called, ALT_frequency:stats?.af,
    Gene_IRI:gene && namespace + 'gene_' + gene.id, Site_IRI:siteKey && namespace + siteKey,
    Evidence_level:site?.level, Functional_DOI:site?.primary?.join(' '), Event_DOI:site?.event?.join(' '),
    Gene_DOI:(site?.background ?? evidence.genes[gene?.id] ?? []).join(' ')
  };
}

export function priorResults(records, cohort, evidence) {
  return records.flatMap(record => record.sites.map((site, i) => {
    const marker = matchMarker(record.gene, record, site);
    const status = marker ? 'matched' : !record.gene ? 'gene_unresolved' : !site.pos ? 'position_missing' : 'site_unmatched';
    return {...record.row, Input_row:record.line, Input_DOI:record.inputDOI.join(' '), Component:i+1, ...markerSummary(record.gene, marker, status, cohort, evidence)};
  }));
}

export function comparisonResults(genes, cohort, evidence) {
  return genes.flatMap(gene => {
    const row = {QTG:gene.name, Trait:gene.prior, Function:gene.description, MSU_ID:gene.catalog?.msu, Chr:gene.chromosome};
    if (!gene.variants.length) return [{...row, ...markerSummary(gene, null, 'no_typed_site', cohort, evidence)}];
    return gene.variants.map(marker => ({
      ...row, Position:marker.pos, Ref:marker.ref, Component:1,
      ...markerSummary(gene, marker, 'typed', cohort, evidence)
    }));
  });
}

// Input line and ordinal identify a component inside this import, even for repeated or unmapped rows.
export function priorGraph(records, results, filename, cohort) {
  const ref = id => ({'@id':id});
  const sources = text => text ? text.split(' ').map(d => ref('https://doi.org/' + d)) : [];
  const graph = [
    {'@id':'_:input', '@type':'InputDataset', label:filename},
    {'@id':'_:cohort', '@type':'Cohort', n:cohort.length, accessionIds:cohort.map(s => s.id)},
    {'@id':'_:analysis', '@type':'ComponentMatching', tool:ref('rf:RiceFlux'), input:ref('_:input'), cohort:ref('_:cohort')}
  ];
  let index = 0;
  for (const record of records) {
    const ordered = [];
    for (const [i, site] of record.sites.entries()) {
      const row = results[index++];
      const id = '_:r' + record.line + 'c' + (i+1);
      const match = {
        '@id':id+'m', '@type':'ComponentMatch', component:ref(id), analysis:ref('_:analysis'), status:row.Status
      };
      if (row.Site_IRI) Object.assign(match, {
        matchedSite:ref(row.Site_IRI), refCopies:row.REF_copies, altCopies:row.ALT_copies,
        calledCopies:row.Called_copies, altFrequency:row.ALT_frequency, evidenceLevel:row.Evidence_level,
        functionalSources:sources(row.Functional_DOI), eventSources:sources(row.Event_DOI)
      });
      graph.push({'@id':id,'@type':'OrderedComponent',ordinal:i+1, position:site.pos, reference:site.ref}, match);
      ordered.push(ref(id));
    }
    const first = results[index - ordered.length];
    graph.push({
      '@id':'_:r'+record.line, '@type':'PriorEvent', input:ref('_:input'), inputRow:record.line,
      suppliedFields:{'@value':record.row,'@type':'@json'},
      ...(first.Gene_IRI ? {aboutGene:ref(first.Gene_IRI),geneLiterature:sources(first.Gene_DOI)} : {}),
      traitLabel:record.row.Trait, claim:record.row.Function, hapLabel:record.row.Hap,
      suppliedSources:record.inputDOI.map(d => ref('https://doi.org/' + d)),
      chromosome:record.chromosome || null, assembly:'IRGSP-1.0 / MSU7', orderedComponents:{'@list':ordered}
    });
  }
  return {'@context':{'@version':1.1,'@vocab':namespace,rf:namespace,label:'http://www.w3.org/2000/01/rdf-schema#label'},'@graph':graph};
}
