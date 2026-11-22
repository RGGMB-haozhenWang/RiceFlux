import React,{useState} from 'react';
import {downloadTable} from './formats.js';
import {pavCounts,pavNames,pavState} from './pav.js';
import {comparePav,pavComparisonRows,comparisonStatus} from './pavHaplotype.js';

const allelePreview=value=>value.length<=14?value:`${value.slice(0,6)}…${value.slice(-3)} (${value.length} nt)`;
const eventLabel=event=>`Chr${event.chr}:${event.position} · ${event.kind} ${Math.abs(event.lengthChange)} bp`;

export function PavPanel({gene,cohort,populations,variants=[],view}){
  const [selection,setSelection]=useState('');
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
  const individual=gene.pav.filter(assay=>!assay.groups&&assay.sampleIndex);
  const options=individual.flatMap(assay=>[false,...(variants.length?[true]:[])].map(combined=>({
    key:JSON.stringify([assay.datasetId,assay.id,combined]),assay,combined,
  })));
  const selected=options.find(option=>option.key===selection)||options[0];
  const comparison=selected?comparePav({gene,assay:selected.assay,cohort,variants:selected.combined?variants:[],view}):null;
  function downloadComparison(kind){
    const rows=pavComparisonRows(comparison)[kind];
    if(!rows.length)return;
    downloadTable({filename:gene.id+'_pav_comparison_'+kind+'.txt',columns:Object.keys(rows[0])},rows);
  }
  return <details className="locus-details">
    <summary>存在 / 缺失（基因 / 片段 PAV） · {gene.pav.length} 条证据</summary>
    {gene.pav.map(assay=><section key={assay.datasetId+'|'+assay.id} aria-label="PAV 群体分布">
      <p><b>{assay.event?'片段 PAV':'基因 PAV'} · {assay.datasetName}</b> · {assay.sourceGene} · {assay.source.release}
        {' · '}{assay.source.doi?<a href={'https://doi.org/'+assay.source.doi} target="_blank" rel="noreferrer">原文 DOI</a>:assay.source.citation}
        {' · '}<button type="button" onClick={()=>download(assay)}>{assay.groups?'发布汇总 TXT':'逐材料 TXT'}</button></p>
      {assay.event&&<p className="footnote" title={assay.event.ref+' → '+assay.event.alt}>
        {eventLabel(assay.event)} · {allelePreview(assay.event.ref)} → {allelePreview(assay.event.alt)} · {assay.event.originalId}</p>}
      {assay.groups&&<p className="footnote">原库发布群体及分母 · 独立于本页筛选的材料；只有汇总，不能与 SNP / 短 InDel 按材料合并。</p>}
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
    <section className="pav-comparison" aria-label="PAV 组合分型比较">
      <h4>按材料比较 SNP / 短 InDel + PAV</h4>
      <p className="footnote">只合并同一数据集内、材料 ID 匹配的逐材料测定。短变异仅使用完整纯合型；杂合型不推断相位。比例以当前全部所选材料为分母，未判定和未覆盖分别保留。</p>
      {!options.length?<p>当前 PAV 只有发布汇总或没有逐材料测定，无法进行个体级组合比较。</p>:<>
        <label>比较内容 <select value={selected.key} onChange={event=>setSelection(event.target.value)}>
          {options.map(option=><option key={option.key} value={option.key}>{option.assay.datasetName} · {option.assay.event?eventLabel(option.assay.event):option.assay.sourceGene} · {option.combined?'当前所选 SNP / 短 InDel + PAV':'仅 PAV'}</option>)}
        </select></label>
        <p className="footnote" title={selected.assay.id}>{gene.assembly} · {comparison.sites.length?comparison.sites.map(site=>`${site.chr}:${site.position} ${allelePreview(site.ref)}→${site.alt.map(allelePreview).join(',')}`).join('；'):'未选择短变异'}</p>
        <p>当前 {comparison.total} 份材料：PAV 存在 {comparison.counts.present}，缺失 {comparison.counts.absent}，未判定 {comparison.counts.unknown}，未覆盖 {comparison.counts.unassayed}。
          {selected.combined&&<> 短变异缺失 {comparison.counts.short_missing}，含杂合 {comparison.counts.short_heterozygous}，未覆盖 {comparison.counts.short_unassayed}（缺失与杂合可重叠）。</>}</p>
        {comparison.unavailable?<p>所选位点包含不支持的变异，无法组合判型。</p>:<>
          <button type="button" disabled={!comparison.groups.length} onClick={()=>downloadComparison('groups')}>组合分组 TXT</button>{' '}
          <button type="button" disabled={!comparison.members.length} onClick={()=>downloadComparison('materials')}>组合逐材料 TXT</button>
          <div className="matrix-scroll"><table className="individual-table"><thead><tr>
            <th>按上列坐标排序的等位向量</th><th>PAV</th><th>材料数</th><th>占当前材料</th>
            {view?.active?.id&&<><th>当前试验配对 n</th><th>当前试验中位数</th></>}
          </tr></thead><tbody>{comparison.groups.map(group=><tr key={group.key}>
            <th scope="row" title={group.bases||undefined}>{group.bases?group.bases.split(' ').map(allelePreview).join(' · '):'仅 PAV'}</th><td>{pavNames[group.state]}</td><td>{group.n}</td><td>{(100*group.ratio).toFixed(1)}%</td>
            {view?.active?.id&&<><td>{group.pairedN}</td><td>{group.median===null?'—':`${group.median} ${view.unit||''}`}</td></>}
          </tr>)}</tbody></table></div>
          {!comparison.groups.length&&<p>当前没有完整可判定的组合型。</p>}
          {view?.active?.id&&<p className="footnote">仅当前试验 {view.active.assay} · {view.active.source?.site} · {view.active.source?.year}（{view.active.id}）的描述统计；不跨试验合并。</p>}
          <p className="footnote">逐材料 TXT 保留 {comparisonStatus('missing')}、{comparisonStatus('heterozygous')}、PAV 未判定及未覆盖原因。组合身份由坐标、等位向量、数据集与测定共同定义，不沿用固定 Hap 编号。</p>
        </>}
      </>}
    </section>
  </details>;
}
