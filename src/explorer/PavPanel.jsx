import React from 'react';
import {downloadTable} from './formats.js';
import {pavCounts,pavNames,pavState} from './pav.js';

export function PavPanel({gene,cohort,populations}){
  if(!gene.pav?.length)return null;
  const ids=new Set(cohort.map(s=>s.population_id));
  const byGroup=new Map([...ids].map(id=>[id,[]]));
  for(const sample of cohort)byGroup.get(sample.population_id).push(sample);
  function download(assay){
    if(assay.groups){
      const columns=['dataset_id','dataset_version','gene_id','source_gene_id','population','present','absent','total','source_id','doi'];
      downloadTable({filename:gene.id+'_published_pav.txt',columns},assay.groups.map(row=>({...row,dataset_id:assay.datasetId,
        dataset_version:assay.version,gene_id:gene.id,source_gene_id:assay.sourceGene,source_id:assay.source.id,doi:assay.source.doi})));
      return;
    }
    const columns=['dataset_id','dataset_version','sample_id','population','gene_id','source_gene_id','status','method','source_id','doi'];
    const rows=cohort.flatMap(sample=>{
      const status=pavState(assay,sample);
      return status==='unassayed'?[]:[{dataset_id:assay.datasetId,dataset_version:assay.version,sample_id:sample.source_sample_id??sample.id,
        population:sample.population_id,gene_id:gene.id,source_gene_id:assay.sourceGene,status,method:assay.source.method,source_id:assay.source.id,doi:assay.source.doi}];
    });
    downloadTable({filename:gene.id+'_pav.txt',columns},rows);
  }
  return <details className="locus-details">
    <summary>基因存在 / 缺失（PAV） · {gene.pav.length} 条证据</summary>
    {gene.pav.map(assay=><section key={assay.datasetId+'|'+assay.id} aria-label="PAV 群体分布">
      <p><b>{assay.datasetName}</b> · {assay.sourceGene} · {assay.source.release}
        {' · '}{assay.source.doi?<a href={'https://doi.org/'+assay.source.doi} target="_blank" rel="noreferrer">原文 DOI</a>:assay.source.citation}
        {' · '}<button type="button" onClick={()=>download(assay)}>{assay.groups?'发布汇总 TXT':'逐材料 TXT'}</button></p>
      {assay.groups&&<p className="footnote">原库发布群体及分母 · 独立于本页筛选的材料</p>}
      <div className="matrix-scroll"><table className="individual-table">
        <thead><tr><th>群体</th><th>{pavNames.present}</th><th>{pavNames.absent}</th><th>{pavNames.unknown}</th><th>存在 / 已判定</th></tr></thead>
        <tbody>{assay.groups?assay.groups.map(row=><tr key={row.population}><th scope="row">{row.population}</th>
          <td>{row.present}</td><td>{row.absent}</td><td>—</td><td>{row.present}/{row.total} · {(100*row.present/row.total).toFixed(1)}%</td></tr>):
        [['当前所选',cohort],...populations.filter(p=>ids.has(p.id)).map(p=>[p.name,byGroup.get(p.id)])].map(([label,members],i)=>{
          const n=pavCounts(assay,members);
          return n.total>0?<tr key={i}><th scope="row">{label}</th><td>{n.present}</td><td>{n.absent}</td><td>{n.unknown}</td><td>{n.called?`${n.present}/${n.called} · ${(100*n.present/n.called).toFixed(1)}%`:'—'}</td></tr>:null;
        })}</tbody>
      </table></div>
      <p className="footnote">{assay.source.method}</p>
    </section>)}
  </details>;
}
