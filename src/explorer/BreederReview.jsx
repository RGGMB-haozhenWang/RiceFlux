import {useText} from './locale.jsx';
import React,{useMemo,useState} from 'react';
import {downloadTable,matchesMaterial} from './formats.js';
import {isCross,materialKey} from './breeder.js';
import {statusText} from './jointHaplotypes.js';
import {readableDefinition} from './provenance.js';
import {siteName} from './regions.js';
import {SampleList} from './SampleList.jsx';
import {TrialProtocol} from './TrialProtocol.jsx';

export const shown=n=>Number.isFinite(n)?Number(n.toFixed(2)).toLocaleString():'—';
const exact=n=>Number.isFinite(n)?String(n):'—';
export const shortType=label=>readableDefinition(label).replace(/ · Zhang 2022$/,'');
export const callLabel=c=>c?.status==='called'?shortType(c.label):c?statusText[c.status]:'—';
const rawId=s=>s.source_sample_id??s.id;
const name=s=>s.name||rawId(s);
const targetLabels={met:'达标',outside:'范围外',missing:'缺测',uncovered:'其他来源'};
const sourceLabel=axis=>[siteName(axis.source.original_site??axis.source.site),axis.source.year,
  axis.assay!==axis.trait_name&&axis.assay].filter(Boolean).join(' · ');

export function ReviewSource({axis,sources,onAxis,datasets,allowSwitch=true}){
  const localize = useText();
  const choices=sources.filter(e=>e.trait_id===axis.trait_id).sort((a,b)=>b.observed-a.observed);
  return <details className="review-disclosure">
    <summary>{localize("表型来源")}</summary>
    <div className="review-details">
      {allowSwitch&&choices.length>1&&<label>{localize("测定记录")}<select aria-label={localize("切换表型来源")} value={axis.key} onChange={e=>onAxis(e.target.value)}>
        {choices.map(e=><option key={e.key} value={e.key}>
          {localize([sourceLabel(e),e.unit,datasets.length>1&&e.dataset,e.observed+' 份实测'].filter(Boolean).join(' · '))}
        </option>)}
      </select></label>}
      {axis.source.provenance?<TrialProtocol record={axis.source.provenance}/>:
        <p>{localize(sourceLabel(axis))} · {localize(axis.unit)} · {localize(axis.dataset)} {localize(axis.version)}</p>}
    </div>
  </details>;
}

export function ReviewRange({axis,bounds,target,onBounds,observations,selectedCount,scopeLabel='已选'}){
  const localize = useText();
  const observed=observations.filter(r=>Number.isFinite(r.value));
  if(!observed.length)return null;
  const values=observed.map(r=>r.value);
  const low=values.reduce((a,b)=>Math.min(a,b)),high=values.reduce((a,b)=>Math.max(a,b));
  const range=target.min===null?'≤ '+exact(target.max):target.max===null?'≥ '+exact(target.min):exact(target.min)+'–'+exact(target.max);
  return <details className="review-disclosure review-range">
    <summary data-active={target.active}>{target.invalid?localize("检查区间"):target.active?range+' '+axis.unit:localize("设筛选区间")}</summary>
    <div className="review-details">
      <p>{localize(scopeLabel)} {localize(selectedCount)}{" "+localize("份中")+" "}{localize(observed.length)}{" "+localize("份实测 ·")+" "}{localize(low===high?exact(low):exact(low)+'–'+exact(high))} {localize(axis.unit)}</p>
      <div className="breeder-target-fields">
        <label>{localize("下限 ·")+" "}{localize(axis.unit)}<input type="number" step="any" aria-label={localize("目标下限")} value={bounds.min??''}
          onChange={e=>onBounds({...bounds,min:e.target.value})}/></label>
        <label>{localize("上限 ·")+" "}{localize(axis.unit)}<input type="number" step="any" aria-label={localize("目标上限")} value={bounds.max??''}
          onChange={e=>onBounds({...bounds,max:e.target.value})}/></label>
        <button type="button" disabled={!bounds.min&&!bounds.max} onClick={()=>onBounds({})}>{localize("清除")}</button>
      </div>
      {target.invalid&&<p role="alert">{localize("下限须小于或等于上限。")}</p>}
    </div>
  </details>;
}

function ReviewDetails({sample,sources,axis,models,calls,onAxis}){
  const localize = useText();
  const readings=sources.filter(e=>e.dataset===sample.dataset_id&&e.trait_id===axis?.trait_id&&Number.isFinite(sample.phenotypes[e.id]));
  return <div className="review-inspector" role="region" aria-label={localize(name(sample)+' 的核查详情')}>
    <div><h3>{axis?.trait_name??localize("表型")}{localize("测定记录")}</h3>
      {!readings.length?<p>{localize("当前性状无实测记录。")}</p>:<ul>{readings.map(e=><li key={e.key}>
        <span>{localize(sourceLabel(e))} · <b>{localize(exact(sample.phenotypes[e.id]))} {localize(e.unit)}</b></span>
        {e.key!==axis.key&&<button type="button" onClick={()=>onAxis(e.key)}>{localize("对照此记录")}</button>}
      </li>)}</ul>}
    </div>
    {models.length>0&&<div><h3>{localize("分型依据")}</h3><ul>{models.map(m=>{
      const call=calls?.calls[m.index],doi=m.scheme.doi[0],geneDoi=m.gene.catalog?.geneDOI?.[0];
      return <li key={m.gene.id}>
        <span><b>{localize(m.gene.name)}</b> · {localize(callLabel(call))} · {localize(sample.genotype_evidence)}
          {call?.bases&&<small title={localize(m.scheme.positions.join(', '))}>{localize("有序调用")+" "}{localize(call.bases)}</small>}</span>
        {doi?<a href={'https://doi.org/'+doi} target="_blank" rel="noreferrer">{localize("型别原文")}</a>:
          geneDoi&&<a href={'https://doi.org/'+geneDoi} target="_blank" rel="noreferrer">{localize("基因文献")}</a>}
      </li>;
    })}</ul></div>}
  </div>;
}

export function BreederReview({data,candidates,selected,totalSelected,unavailable,scope,changeScope,add,remove,clear,
  axis,sources,bounds,target,onAxis,onTrait,onBounds,models,observations,referenceN,callById,combo,clearCombo,children,showInput=true}){
  const localize = useText();
  const [query,setQuery]=useState(''),[detail,setDetail]=useState(''),[only,setOnly]=useState(''),[sort,setSort]=useState(''),[page,setPage]=useState(0);
  const [browsing,setBrowsing]=useState(false);
  const selectedKeys=useMemo(()=>new Set(selected.map(materialKey)),[selected]);
  const datasetById=useMemo(()=>new Map(data.meta.datasets.map(d=>[d.id,d])),[data]);
  const matches=useMemo(()=>query.trim()?candidates.filter(s=>matchesMaterial(s,query)):[],[candidates,query]);
  const observedById=useMemo(()=>new Map(observations.map(r=>[r.sample.id,r])),[observations]);
  const met=observations.filter(r=>r.target_status==='met').length;
  const count=observations.filter(r=>Number.isFinite(r.value)).length;
  const checked=count>0&&target.active&&only===axis?.key;
  const withRows=selected.length>0&&!browsing;
  const list=withRows?selected.filter(s=>
    (!combo||callById.get(s.id)?.key===combo)&&(!checked||observedById.get(s.id)?.target_status==='met')
  ):candidates;
  const compareValues=(a,b)=>{
    const x=observedById.get(a.id)?.value,y=observedById.get(b.id)?.value;
    if(!Number.isFinite(x))return Number.isFinite(y)?1:0;
    if(!Number.isFinite(y))return -1;
    return sort==='asc'?x-y:y-x;
  };
  if(sort&&withRows)list.sort(compareValues);
  const size=withRows?16:8,last=Math.max(0,Math.ceil(list.length/size)-1),activePage=Math.min(page,last);
  const visible=list.slice(activePage*size,(activePage+1)*size);
  const traits=new Map(sources.map(e=>[e.trait_id,e.trait_name]));
  const definitions=JSON.stringify(Object.fromEntries(models.map(m=>[m.gene.id,{
    gene_name:m.gene.name,msu_id:m.gene.catalog?.msu??'',scheme:m.scheme.id,
    markers:m.scheme.markers.map(v=>v?.id??null),doi:m.scheme.doi
  }])));
  function addMatches(samples){
    add(samples);
    setPage(0);
    setQuery('');
  }
  function keySearch(e){
    if(e.key==='Escape')setQuery('');
    if(e.key!=='Enter')return;
    const term=query.trim().toLowerCase();
    const exact=matches.filter(s=>[rawId(s),name(s)].some(v=>v.toLowerCase()===term));
    const result=exact.length?exact:matches;
    if(result.length===1)addMatches(result);
  }
  function exportReview(){
    const fields=['dataset_id','dataset_version','sample_id','name','material_type','source_group','phenotype_dataset_id',
      'phenotype_dataset_version','trait_id','environment_id','site','year','assay','unit','value','percentile','reference_n',
      'phenotype_status','target_min','target_max','target_status','genotype_evidence','genotype_definitions',
      ...models.flatMap(m=>[m.gene.id,m.gene.id+'_status',m.gene.id+'_calls'])];
    downloadTable({filename:'riceflux_material_review.txt',columns:fields},list.map(s=>{
      const r=observedById.get(s.id),calls=callById.get(s.id)?.calls??[];
      const callsByGene=Object.fromEntries(models.flatMap((m,i)=>[
        [m.gene.id,calls[i]?.label],[m.gene.id+'_status',calls[i]?.status??'not_loaded'],[m.gene.id+'_calls',calls[i]?.bases]
      ]));
      return {...r,dataset_id:s.dataset_id,dataset_version:datasetById.get(s.dataset_id)?.version,sample_id:rawId(s),name:name(s),
        material_type:s.kind,source_group:s.source_group,phenotype_dataset_id:axis?.dataset,phenotype_dataset_version:axis?.version,
        trait_id:axis?.trait_id,environment_id:axis?.environment,site:axis?.source.original_site??axis?.source.site,
        year:axis?.source.year,assay:axis?.assay,unit:axis?.unit,
        phenotype_status:!axis?'unavailable':!r?'outside_dataset':r.value===null?'missing':'measured',
        target_min:target.min,target_max:target.max,target_status:r?.target_status??(axis?'uncovered':''),
        genotype_evidence:s.genotype_evidence,genotype_definitions:definitions,...callsByGene};
    }));
  }
  return <section className="breeder-card review-card" aria-label={localize("材料审查")}>
    {(showInput||data.individuals.some(isCross))&&<div className="review-toolbar">
      {data.individuals.some(isCross)&&<select aria-label={localize("材料类别")} value={scope}
        onChange={e=>{changeScope(e.target.value);setPage(0);setQuery('');}}>
        <option value="material">{localize("品种与中间材料")}</option><option value="cross">{localize("杂交组合")}</option>
      </select>}
      {showInput&&<><div className="review-search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setQuery('');}}>
        <input aria-label={localize("搜索材料")} type="search" placeholder={localize("输入品种名或材料编号")} value={query} onKeyDown={keySearch} onChange={e=>setQuery(e.target.value)}/>
        {query.trim()&&<div className="review-matches">
          {matches.slice(0,8).map(s=><button key={s.id} type="button" disabled={selectedKeys.has(materialKey(s))}
            onClick={()=>addMatches([s])}><span><strong>{localize(name(s))}</strong><small>{localize(rawId(s))} · {localize(datasetById.get(s.dataset_id)?.name)}</small></span>
            <span>{selectedKeys.has(materialKey(s))?localize("已在清单"):localize("加入")}</span></button>)}
          {!matches.length&&<p role="status">{localize("未找到匹配材料。")}</p>}
          {matches.length>8&&<p>{localize("匹配")+" "}{localize(matches.length)}{" "+localize("份，可继续输入编号缩小范围。")}</p>}
        </div>}
      </div>
      <SampleList data={data} onApply={samples=>{addMatches(samples);setBrowsing(false);}} review/></>}
    </div>}
    <div className="review-heading">
      <h2>{withRows?localize("审查清单"):localize("材料名录")}</h2>
      <span role="status">{localize(selected.length?('已选 '+selected.length.toLocaleString()+' 份'):candidates.length.toLocaleString()+' 份')}
        {localize(totalSelected>selected.length?' · 含另一类别共 '+totalSelected.toLocaleString()+' 份':'')}
        {localize(unavailable?' · '+unavailable+' 份所属数据集未开启':'')}</span>
      {selected.length>0&&<button className="review-link review-to-end" type="button"
        onClick={()=>{setBrowsing(!browsing);setPage(0);}}>{withRows?localize("继续选材"):localize("查看清单")}</button>}
      {withRows&&<button className="review-link" type="button" onClick={()=>{clear();setPage(0);}}>{localize("清空清单")}</button>}
    </div>
    {withRows&&<div className="review-options">
      {axis&&<label>{localize("性状")}<select aria-label={localize("选择性状")} value={axis.trait_id} onChange={e=>{onTrait(e.target.value);setPage(0);}}>
        {[...traits].map(([id,label])=><option key={id} value={id}>{localize(label)}</option>)}
      </select></label>}
      {localize(children)}
      {axis&&count>0&&<ReviewRange key={axis.key} axis={axis} bounds={bounds} target={target} onBounds={onBounds}
        observations={observations} selectedCount={selected.length}/>}
    </div>}
    {withRows&&(axis||combo)&&<div className="breeder-counts">
      {axis&&<span>{localize(count)} / {localize(selected.length)}{" "+localize("份实测")}</span>}
      {target.active&&count>0&&<span>{localize(met)} / {localize(count)}{" "+localize("达标")}</span>}
      {target.active&&count>0&&<label className="breeder-check"><input type="checkbox" checked={checked}
        onChange={e=>{setOnly(e.target.checked?axis.key:'');setPage(0);}}/>{localize("仅看达标")}</label>}
      {combo&&<button className="review-link" type="button" onClick={clearCombo}>{localize("清除组合筛选 ×")}</button>}
    </div>}
    {visible.length>0&&<div className="matrix-scroll review-matrix"><table className="individual-table" aria-label={withRows?localize("材料联审表"):localize("材料名录")}>
      <thead><tr><th scope="col">{localize("材料")}</th>{withRows&&axis&&<th scope="col"
        aria-sort={sort==='asc'?'ascending':sort==='desc'?'descending':'none'}>
        <button className="review-link review-sort" type="button" aria-label={localize('按'+axis.trait_name+'排序')}
          onClick={()=>{setSort(sort==='asc'?'desc':'asc');setPage(0);}}>{localize(axis.trait_name)} · {localize(axis.unit)} {localize(sort==='asc'?'↑':sort==='desc'?'↓':'↕')}</button>
        <small>{localize(sourceLabel(axis))}{localize(data.meta.datasets.length>1?' · '+axis.dataset:'')}</small>
      </th>}
      {withRows&&models.map(m=><th scope="col" key={m.gene.id}>{localize(m.gene.name)}<small>{m.scheme.kind==='literature'?localize("文献型"):m.scheme.kind==='custom'?localize("自选型"):localize("标记型")}</small></th>)}
      {withRows&&axis&&target.active&&<th scope="col">{localize("区间")}</th>}
      <th scope="col">{withRows?'':localize("加入清单")}</th></tr></thead>
      <tbody>{visible.map(s=>{
        const r=observedById.get(s.id),calls=callById.get(s.id),open=detail===s.id;
        const label=name(s),span=2+(withRows?models.length+Number(!!axis)+Number(!!axis&&target.active):0);
        return <React.Fragment key={s.id}><tr>
          <th scope="row">{withRows?<button className="review-link review-name" type="button" aria-expanded={open}
            onClick={()=>setDetail(open?'':s.id)}>{localize(label)}</button>:<strong>{localize(label)}</strong>}
            <small>{localize(rawId(s))} · {localize(datasetById.get(s.dataset_id)?.name)}{localize(s.source_group?' · '+s.source_group:'')}</small>
          </th>
          {withRows&&axis&&<td>{!r?localize("其他来源"):r.value===null?localize("缺测"):exact(r.value)}
            {r?.percentile!=null&&<small title={localize('同一测定记录参考 n='+r.reference_n)}>{localize("百分位")+" "}{localize(shown(r.percentile))}%</small>}</td>}
          {withRows&&models.map(m=><td key={m.gene.id}>{localize(callLabel(calls?.calls[m.index]))}</td>)}
          {withRows&&axis&&target.active&&<td className={r?.target_status==='met'?'breeder-met':''}>{localize(targetLabels[r?.target_status??'uncovered'])}</td>}
          <td className="review-row-action">{withRows?<button className="review-link" type="button" aria-label={localize('从清单移除 '+label)} onClick={()=>remove(s)}>{localize("移除")}</button>:
            selectedKeys.has(materialKey(s))?'已加入':<button className="review-link" type="button" aria-label={localize('加入 '+label)} onClick={()=>addMatches([s])}>{localize("加入")}</button>}</td>
        </tr>
        {withRows&&open&&<tr><td colSpan={span}><ReviewDetails sample={s} sources={sources} axis={axis} models={models} calls={calls} onAxis={onAxis}/></td></tr>}</React.Fragment>;
      })}</tbody>
    </table></div>}
    {!visible.length&&<p className="breeder-note">{withRows?localize("当前筛选没有匹配记录。"):localize("这一类别暂无可用材料。")}</p>}
    <div className="review-footer">
      {withRows&&axis&&<ReviewSource axis={axis} sources={sources} onAxis={onAxis} datasets={data.meta.datasets}/>}
      {withRows&&axis&&referenceN>0&&<small>{localize("百分位参考 n=")}{localize(referenceN.toLocaleString())}</small>}
      <div className="review-to-end review-pagination">
        {last>0&&<><button className="review-link" type="button" disabled={!activePage} onClick={()=>setPage(activePage-1)}>{localize("上一页")}</button>
          <span>{localize(activePage*size+1)}–{localize(Math.min((activePage+1)*size,list.length))} / {localize(list.length.toLocaleString())}</span>
          <button className="review-link" type="button" disabled={activePage===last} onClick={()=>setPage(activePage+1)}>{localize("下一页")}</button></>}
        {withRows&&<button className="review-link" type="button" disabled={!list.length} onClick={exportReview}>{localize("下载审查表 TXT")}</button>}
      </div>
    </div>
  </section>;
}
