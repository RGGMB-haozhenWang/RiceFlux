import {useText} from './locale.jsx';
import React,{useMemo,useState} from 'react';
import {minimumGroupN,phenotypeComparison} from './phenotypeTests.js';
import {saveFile,writeTSV} from './formats.js';
import {zipTables} from './exports.js';
import {siteName} from './regions.js';

const names={welch:'Welch ANOVA',kruskal:'Kruskal–Wallis'};
const status={estimated:'',too_few_groups:'有效组不足',zero_within_group_variance:'有组内方差为零',all_tied:'观察值全相同',ordinal_scale:'等级表型采用秩检验',unknown_scale:'原指标量纲待核',numerical_limit:'数值无法估计'};
const fmt=(x,p=3)=>Number.isFinite(x)?x.toPrecision(p):'—';
const pval=x=>x===0?'< 1e−300':fmt(x);

export function PhenotypeTests({groups,view,definition}){
  const localize = useText();
  const [open,setOpen]=useState(false);
  const output=useMemo(()=>open?phenotypeComparison(groups,view.sites.map(s=>s.endpoint).filter(Boolean)):null,[open,groups,view]);
  function download(){
    const context={trait:definition.trait,gene_id:definition.gene,group_mode:definition.mode,marker_ids:definition.markers.join(';'),minimum_group_n:minimumGroupN,
      test_scope:'within each dataset/site/year/assay; unadjusted for population structure',holm_scope:'estimable endpoints by method within view'};
    const tests=output.tests.map(row=>({...row,...context})),counts=output.counts.map(row=>({...row,...context}));
    saveFile('riceflux_phenotype_tests.zip',zipTables({
      'tests.tsv':writeTSV(['environment_id','dataset_id','site','year','assay','unit','method','n','group_n','excluded_groups','statistic','df1','df2','p','holm','family_size','status',...Object.keys(context)],tests),
      'groups.tsv':writeTSV(['environment_id','dataset_id','site','year','assay','unit','group','definition','n','mean','sd','included',...Object.keys(context)],counts),
    }),'application/zip');
  }
  return <details className="phenotype-tests" onToggle={e=>setOpen(e.currentTarget.open)}><summary>{localize("组间检验 / Tests")}</summary>
    {output&&<><p className="footnote">{localize("按数据集、地点、年份和指标检验。每组至少")+" "}{localize(minimumGroupN)}{" "+localize("份有效材料。同一方法在当前年份和指标的试验间做 Holm 校正。结果供探索，未校正亲缘或群体结构。")}</p>
      <div className="matrix-scroll"><table className="individual-table"><thead><tr>{['地点','检验','组数 / n','统计量','P','Holm P','状态'].map(name=><th key={name}>{localize(name)}</th>)}</tr></thead><tbody>{output.tests.map(row=><tr key={row.environment_id+row.method} className={row.environment_id===view.active.id?'selected-person':''}><td>{localize(siteName(row.site))}</td><td>{localize(names[row.method])}</td><td>{localize(row.group_n)} / {localize(row.n)}</td><td>{localize(fmt(row.statistic))}</td><td>{localize(pval(row.p))}</td><td>{localize(pval(row.holm))}</td><td>{status[row.status]||localize("排除小样本组 #0#", [row.excluded_groups])}</td></tr>)}</tbody></table></div>
      <details><summary>{localize("当前地点各组有效数 / Group counts")}</summary><ul>{output.counts.filter(row=>row.environment_id===view.active.id).map(row=><li key={row.group}>{localize(row.group)} · n={localize(row.n)}{" "+localize("· 均值")+" "}{localize(fmt(row.mean))} {localize(row.unit)} · SD {localize(fmt(row.sd))}{!row.included?localize(" · 样本不足"):''}</li>)}</ul></details>
      <button onClick={download}>{localize("下载检验与组别 TSV")}</button></>}
  </details>;
}
