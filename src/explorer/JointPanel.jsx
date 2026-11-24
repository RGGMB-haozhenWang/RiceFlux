import {useText} from './locale.jsx';
import {presetTitle,readableDefinition} from './provenance.js';
import {PopulationComposition} from './PopulationComposition.jsx';
import React,{useMemo,useRef,useState} from 'react';
import {geneSchemes,jointCalls,statusText} from './jointHaplotypes.js';
import {formats,downloadTable,materialRow,matchesMaterial} from './formats.js';
import {SitePicker} from './SitePicker.jsx';

const kinds={literature:'文献命名型',input:'导入状态型',observed:'群体纯合标记型',custom:'自选纯合标记型'};
const pct=(n,d)=>d?(100*n/d).toFixed(1)+'%':'—';
const displayCall=c=>c.status==='called'?readableDefinition(c.label):statusText[c.status]+(c.label?' · '+c.label:'');
function schemeTitle(s){
  const title=kinds[s.kind]+' · '+s.positions.length+' 位点';
  return title+(s.definitions.length?' · '+presetTitle(s):'')+(!s.ready?'（无法完整判型）':'');
}
function Definition({gene,cohort,schemes,current,custom,onChange,onCustom}){
  const localize = useText();
  return <div className="joint-definition"><label><strong>{localize(gene.name)}</strong>
    <select aria-label={localize(gene.name+' 判型方案')} value={current.id} onChange={e=>onChange(e.target.value)}>
      {schemes.map(s=><option key={s.id} value={s.id}>{localize(schemeTitle(s))}</option>)}</select></label>
    <SitePicker gene={gene} cohort={cohort} selection={custom} initialIds={current.markers.filter(Boolean).map(v=>v.id)} schemes={schemes} onApply={onCustom}/>
    <details><summary>{localize("位点顺序与型名依据")}</summary>
      <p>{localize(gene.chromosome)} · {current.positions.map(p=>p??'未覆盖').join(' → ')||localize("暂无可用位置")}</p>
      {current.kind==='custom'&&<p>{localize("自选位点组合，不继承文献型名。")}{localize(current.missing.length>0&&'未覆盖：'+current.missing.join('、'))}{current.assemblyMismatch&&localize("参考版本不匹配，需重新选点。")}</p>}
      {current.provenance&&<p>{localize(current.provenance.title)} · {localize(current.provenance.locator)}<br/>{localize(current.provenance.summary)}<br/>{localize(current.provenance.caveat)}</p>}
      {current.doi.map(d=><a key={d} href={'https://doi.org/'+d} target="_blank" rel="noreferrer">{localize(d)} </a>)}
      {current.definitions.length?<ul>{current.definitions.map((d,i)=><li key={i}>{localize(readableDefinition(d.label))} · {localize(d.sequence)}{!d.valid&&localize("（状态未解析）")}</li>)}</ul>:
      <p>{localize("按本面板已有标记的坐标顺序，用实测纯合碱基序列命名。单个位点仅显示单标记型。")}</p>}
    </details></div>;
}

export function JointPanel({data,genes,cohort,records,config={},onConfig}){
  const localize = useText();
  const chosen=config.chosen||{},setChosen=chosen=>onConfig({...config,chosen});
  const policy=config.policy||'all';
  const eligible=policy==='direct'?cohort.filter(s=>s.genotype_evidence==='G_direct'):cohort;
  const [selection,setSelection]=useState('all'),[query,setQuery]=useState('');
  const [limit,setLimit]=useState(24),[comboLimit,setComboLimit]=useState(24);
  const menus=useMemo(()=>{
    return genes.map(g=>geneSchemes(g,data.evidence,records.filter(r=>r.gene===g),config.customSites?.[g.id]));
  },[data.evidence,genes,records,config.customSites]);
  const methods=useMemo(()=>menus.map((menu,i)=>menu.find(s=>s.id===chosen[genes[i].id])||menu[0]),[menus,genes,chosen]);
  const result=useMemo(()=>jointCalls(eligible,methods),[eligible,methods]);
  const popIds=data.populations.map(p=>p.id).filter(id=>result.population.has(id));
  const memberHeading=useRef(null);
  const mode=selection==='unresolved'?'unresolved':selection==='all'?'all':'group';
  const term=query.trim().toLowerCase();
  const rows=result.members.filter(({sample,key})=>(mode==='all'||(mode==='unresolved'?key===null:key===selection))&&
    matchesMaterial(sample,term));
  const selectedGroup=result.groups.find(g=>g.key===selection);
  const statsLabel=mode==='group'?(selectedGroup?.labels.map(readableDefinition).join(' × ')||'当前组合'):mode==='unresolved'?'未完整判型':'全部材料';
  function filterMembers(key){setSelection(key);setLimit(24);setQuery('');}
  const definitionFields=genes.map(g=>'definition|'+g.id);
  const schemeValues=Object.fromEntries(methods.map((s,i)=>[definitionFields[i],JSON.stringify({mode:s.kind,assembly:s.assembly||genes[i].assembly,chr:genes[i].chromosome,marker_ids:s.markerIds||s.markers.map(v=>v?.id??null),positions:s.positions,refs:(s.markerIds?s.markerIds.map(id=>genes[i].variants.find(v=>v.id===id)):s.markers).map(v=>v?.ref??null),ready:s.ready,doi:s.doi,definitions:s.definitions})]));
  function exportGroups(){
    const geneFields=genes.map(g=>g.name+'|'+g.id);
    const fields=formats.jointCombinations.columns.flatMap(key=>{
      if(key==='{gene}|{gene_id}')return geneFields;
      return key==='definition|{gene_id}'?definitionFields:[key];
    });
    const out=[];
    for(const [pop,n,typed] of [['ALL',eligible.length,result.assigned],...popIds.map(p=>[p,result.population.get(p).all,result.population.get(p).assigned])]){
      for(const group of result.groups){
        const count=pop==='ALL'?group.n:group.pops.get(pop)||0;
        out.push({...Object.fromEntries(group.labels.map((l,i)=>[geneFields[i],l])),observed_vectors:group.key,source_group:pop,population_n:n,joint_typed_n:typed,joint_unresolved_n:n-typed,member_n:count,frequency_within_typed:typed?count/typed:null,...schemeValues});
      }
      if(!result.groups.length)out.push({source_group:pop,population_n:n,joint_typed_n:typed,joint_unresolved_n:n-typed,...schemeValues});
    }
    downloadTable(formats.jointCombinations,out.map(row=>({...row,grouping_dimension:data.meta.groupBy||'source_group',dataset_versions:JSON.stringify(data.meta.datasets||[])})),fields);
  }
  function exportMembers(){
    const cols=genes.flatMap(g=>formats.jointMaterials.columnPatterns.map(key=>key.replace('{gene_id}',g.id)));
    const out=rows.map(({sample:s,calls,key})=>{
      const values=calls.flatMap(c=>[c.label,c.status,c.bases]);
      return {...materialRow(s),...schemeValues,dataset_versions:JSON.stringify(data.meta.datasets),joint_status:key?'called':'unresolved',
        ...Object.fromEntries(cols.map((k,i)=>[k,values[i]]))};
    });
    downloadTable(formats.jointMaterials,out,[...formats.jointMaterials.columns,...cols,...definitionFields,'dataset_versions']);
  }
  return <div className="joint-panel">
    <label className="call-policy">{localize("分型证据范围")+" "}<select aria-label={localize("分型证据范围")} value={policy} onChange={e=>{onConfig({...config,policy:e.target.value});filterMembers('all');}}><option value="all">{localize("全部来源（保留各自证据标签）")}</option><option value="direct">{localize("仅声明 G_direct 的数据集")}</option></select><small>{localize("来源标签不替代逐位点 QC。当前保留")+" "}{localize(eligible.length)} / {localize(cohort.length)}{" "+localize("份材料；6044 为 G_chip。")}</small></label>
    <div className="joint-definitions">{genes.map((gene,i)=><Definition key={gene.id} gene={gene} cohort={eligible} schemes={menus[i]} current={methods[i]} custom={config.customSites?.[gene.id]} onCustom={selection=>{onConfig({...config,customSites:{...config.customSites,[gene.id]:selection},chosen:{...chosen,[gene.id]:'custom'}});filterMembers('all');setComboLimit(24);}} onChange={id=>{setChosen({...chosen,[gene.id]:id});filterMembers('all');setComboLimit(24);}}/>)}</div>
    <div className="joint-counters" aria-label={localize("联合判型统计")}>
      {[['当前材料',eligible.length],['完整判型',result.assigned],['未完整判型',eligible.length-result.assigned],['观察到的组合',result.groups.length]].map(([label,n])=><div key={label}><span>{localize(label)}</span><strong>{localize(n.toLocaleString())}</strong></div>)}
    </div>
    <h3>{localize("单倍型组合与群体分布")}</h3>
    <p>{localize("每行是一种实际观察到的组合。各来源群体格内为份数和组内频率，分母是该群体在全部所选基因均已判型的材料数。")}</p>
    <div className="matrix-scroll"><table className="individual-table joint-summary"><thead><tr>
      {genes.map(g=><th key={g.id}>{localize(g.name)}</th>)}<th>{localize("合计 / 频率")}</th><th>{localize("群体组成")}</th>
      {popIds.map(id=><th key={id}>{localize(data.populations.find(p=>p.id===id)?.name)}<small>{localize("已判")+" "}{localize(result.population.get(id).assigned)} / {localize(result.population.get(id).all)}</small></th>)}<th>{localize("成员")}</th></tr></thead>
      <tbody>{result.groups.slice(0,comboLimit).map(g=><tr key={g.key} className={g.key===selection?'joint-selected':''}>
        {g.labels.map((l,i)=><td key={genes[i].id}>{localize(readableDefinition(l))}<small>{localize(JSON.parse(g.key)[i])}</small></td>)}<td><strong>{localize(g.n.toLocaleString())}</strong><small>{localize(pct(g.n,result.assigned))}</small></td><td><PopulationComposition populations={data.populations} counts={g.pops} total={g.n}/></td>
        {popIds.map(id=><td key={id}>{localize(g.pops.get(id)||0)}<small>{localize(pct(g.pops.get(id)||0,result.population.get(id).assigned))}</small></td>)}
        <td><button onClick={()=>{filterMembers(g.key);memberHeading.current?.focus();}}>{localize("查看成员")}</button></td></tr>)}</tbody></table></div>
    {!result.groups.length&&<p>{localize("当前材料及判型方案下没有完整组合。可在材料明细查看各基因的判型状态。")}</p>}
    <div className="compare-tools">{result.groups.length>comboLimit&&<button onClick={()=>setComboLimit(comboLimit+48)}>{localize("更多组合")}</button>}
      <button onClick={exportGroups}>{localize("导出组合与群体频率")}</button></div>
    <h3 tabIndex={-1} ref={memberHeading}>{localize("群体内逐材料分型")}</h3>
    <div className="compare-tools"><button onClick={()=>filterMembers('all')}>{localize("全部材料")}</button><button onClick={()=>filterMembers('unresolved')}>{localize("未完整判型材料")}</button>
      <input aria-label={localize("检索组合成员")} type="search" placeholder={localize("材料编号或名录品种名")} value={query} onChange={e=>{setQuery(e.target.value);setLimit(24);}}/>
      <button onClick={exportMembers}>{localize("导出当前成员分型")}</button></div>
    <p className="joint-member-count">{localize(statsLabel)} · {localize(rows.length.toLocaleString())}{" "+localize("份")}</p>
    <div className="matrix-scroll"><table className="individual-table joint-members"><thead><tr><th>{localize("材料")}</th><th>{localize("来源群体 / 类别")}</th>{genes.map(g=><th key={g.id}>{localize(g.name)}</th>)}</tr></thead>
      <tbody>{rows.slice(0,limit).map(({sample:s,calls})=><tr key={s.id}><td>{localize(s.id)}<small>{localize(s.name)}</small></td><td>{localize(data.populations.find(p=>p.id===s.population_id)?.name)}<small>{s.kind==='landrace'?localize("地方品种"):s.kind==='modern cultivar'?localize("现代品种"):s.kind}</small></td>
        {calls.map((c,i)=><td key={genes[i].id}>{localize(displayCall(c))}<small>{localize(c.bases||'—')}</small></td>)}</tr>)}</tbody></table></div>
    {rows.length>limit&&<button onClick={()=>setLimit(limit+48)}>{localize("查看更多组合成员")}</button>}
  </div>;
}
