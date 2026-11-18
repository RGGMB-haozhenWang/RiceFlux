import './regions.css';
import React, {useMemo,useState} from 'react';
import {regionalDistributions, siteName} from './regions.js';
import {TrialProtocol} from './TrialProtocol.jsx';
import {PhenotypeTests} from './PhenotypeTests.jsx';
import {typeMaterial} from './jointHaplotypes.js';
import {presetTitle,readableDefinition} from './provenance.js';

const numberFormat = new Intl.NumberFormat('zh-CN', {maximumFractionDigits:3,useGrouping:false});
const valueText = value => numberFormat.format(value);

function RangePlot({row, domain}) {
  const position = v => 100 * (v-domain[0]) / (domain[1]-domain[0]);
  const caption = '范围 ' + valueText(row.min) + '–' + valueText(row.max) + '，四分位区间 ' +
    valueText(row.q1) + '–' + valueText(row.q3) + '，中位数 ' + valueText(row.median);
  return <svg className="region-range" viewBox="0 0 100 16" preserveAspectRatio="none" role="img" aria-label={caption}>
    <title>{caption}</title>
    <line className="range-line" x1={position(row.min)} x2={position(row.max)} y1="8" y2="8"/>
    {[row.min,row.max].map((v,i) => <line className="range-line" key={i} x1={position(v)} x2={position(v)} y1="5" y2="11"/>)}
    <rect x={position(row.q1)} width={Math.max(.8,position(row.q3)-position(row.q1))} y="3" height="10" rx="1"/>
    <line className="range-median" x1={position(row.median)} x2={position(row.median)} y1="2" y2="14"/>
    {row.highlighted.map(s => <circle key={s.id} cx={position(s.value)} cy="8" r="2"><title>{s.id} · {s.value}</title></circle>)}
  </svg>;
}

export function RegionalPhenotypes({trait, groups, allGroups=groups, gene, schemes=[],cohort=[],markerIds=[], view, onChange, selectedIds,compact=false}) {
  const [schemeId,setSchemeId]=useState('');
  const available=schemes.filter(s=>s.kind==='literature'&&s.ready);
  const scheme=available.find(s=>s.id===schemeId);
  const named=useMemo(()=>{
    if(!scheme)return null;
    const haps=new Map();
    for(const s of cohort){const call=typeMaterial(s,scheme);if(call.status!=='called')continue;
      if(!haps.has(call.label))haps.set(call.label,{key:call.label,label:readableDefinition(call.label),members:[]});
      haps.get(call.label).members.push(s);
    }
    return [...haps.values()].sort((a,b)=>b.members.length-a.members.length||a.label.localeCompare(b.label));
  },[scheme,cohort]);
  const plotGroups=named||groups;
  const {sites, domain} = useMemo(() => regionalDistributions(plotGroups,view,selectedIds),[plotGroups,view,selectedIds]);
  const activeSite = view.active.source.site;
  return <div className={'regional-chart'+(compact?' compact-regions':'')} aria-label={trait.name+'分地区表型'}>
    <div className="region-toolbar">
      <div className="year-picker" role="group" aria-label="试验年份"><span>试验年份</span>
        {view.years.map(y => <button type="button" key={y} aria-pressed={y===view.year} onClick={() => onChange({year:y})}>{y}</button>)}
      </div>
      {view.assays.length>1 && <label className="assay-picker">鉴定指标
        <select aria-label="鉴定指标" value={view.assay} onChange={e => onChange({assay:e.target.value})}>
          {view.assays.map(a => <option key={a}>{a}</option>)}
        </select></label>}
    </div>
    {compact&&<label className="site-select">试验地点<select aria-label="表型试验地点" value={activeSite} onChange={e=>onChange({site:e.target.value})}>{sites.map(({site})=><option key={site} value={site}>{siteName(site)}</option>)}</select><span>各地分别展示</span></label>}
    <div className="phenotype-tools">
      {available.length>0&&<label>分组 <select aria-label="表型分组方案" value={scheme?.id||''} onChange={e=>setSchemeId(e.target.value)}><option value="">当前位点组合</option>{available.map(s=><option key={s.id} value={s.id}>{presetTitle(s)}</option>)}</select></label>}
      {view.active.source.provenance&&<details className="phenotype-provenance"><summary>鉴定与地点溯源 / Trial source</summary><TrialProtocol record={view.active.source.provenance}/></details>}
      <PhenotypeTests groups={named||allGroups} view={view} definition={{trait:trait.id,gene:gene?.id,mode:scheme?scheme.id:'selected_genotypes',markers:scheme?scheme.markers.map(v=>v.id):markerIds}}/>
    </div>
    <details className="region-description" open={!compact}><summary>统计口径 · {view.unit}</summary><p>各地共用同一横轴。箱体为四分位区间，中线为中位数，两端为最小值和最大值。n 为有测值的组合成员数。</p></details>
    <div className="region-grid">{sites.filter(s=>!compact||s.site===activeSite).map(({site,endpoint,rows,total}) => {
      const active = site===activeSite, name = siteName(site);
      return <section className={'region-card'+(active?' is-active':'')} key={site} aria-label={name+' '+view.year} data-site={site}>
        <header><h3>{name}</h3>
          {endpoint && <button type="button" className="site-detail" aria-label={'查看'+name+'个体明细'} aria-pressed={active}
            onClick={() => onChange({site})}>{active?'已选明细':'查看明细'}</button>}
        </header>
        {total ? <>
          <div className="region-row region-labels"><span>组合</span><span>分布</span><span>中位数</span><span>n</span></div>
          {rows.map(row => <div className="region-row" key={row.key} data-group={row.index+1}>
            <span title={plotGroups[row.index]?.label}>{plotGroups[row.index]?.label?.match(/Hap\s*\d+/i)?.[0]||plotGroups[row.index]?.label||'G'+String(row.index+1).padStart(2,'0')}</span>
            {row.n ? <RangePlot row={row} domain={domain}/> : <span className="missing-range">—</span>}
            <span>{row.n?valueText(row.median):'—'}</span><span>{row.n}</span>
          </div>)}
          <div className="region-row region-scale"><span/><div><span>{valueText(domain[0])}</span><span>{valueText((domain[0]+domain[1])/2)}</span><span>{valueText(domain[1])}</span></div></div>
        </> : <p className="region-empty">{!endpoint?'该年无此测定列':!endpoint.source.n?'原表此列无实测值':!plotGroups.length?'当前无完整基因型组合':'当前组合无实测值'}{endpoint?' · n = 0':''}</p>}
      </section>;
    })}</div>
    <p className="footnote">原始表型见“个体明细”。{selectedIds.length>0?'圆点为关注材料。':''}</p>
  </div>;
}
