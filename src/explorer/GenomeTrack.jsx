import {useText} from './locale.jsx';
import React,{useEffect,useRef,useState} from 'react';
import {chromNum,lengths} from './exchange.js';
import {markerAnnotation} from './alleles.js';
import {MarkerGlyph,MarkerIcon,markerNames} from './VariantMark.jsx';

export function GenomeTrack({gene,variants,selected,onSelect,onInspect}) {
  const localize = useText();
  const svgRef=useRef(null),[pixels,setPixels]=useState(800);
  useEffect(()=>{const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.width)setPixels(entry.contentRect.width)});observer.observe(svgRef.current);return()=>observer.disconnect();},[]);
  const extent=lengths[chromNum(gene.chromosome)]||gene.end;
  const centromere=gene.genomeRegions?.find(r=>r.feature==='centromere_approximate_point');
  const terminalDistance=Math.min(gene.gene_start-1,extent-gene.gene_end),relative=terminalDistance/extent;
  const home={left:gene.start,right:gene.end};
  const [view,setView]=useState(home),drag=useRef(null), suppressClick=useRef(false);
  const width=view.right-view.left+1;
  function viewport(left,size) {
    const span=Math.max(2,Math.min(extent,Math.round(size)));
    const start=Math.max(1,Math.min(extent-span+1,Math.round(left)));
    setView({left:start,right:start+span-1});
  }
  function zoom(factor){const span=Math.min(extent,Math.max(2,Math.round(width*factor)));viewport(view.left+(width-span)/2,span);}
  const scale=p=>42+(p-view.left)/(width-1)*710;
  const features=gene.features||[], promoter=gene.promoter;
  const markers=gene.variants.map(v=>({v,...markerAnnotation(v)}));
  const visible=markers.filter(({v})=>v.pos>=view.left&&v.pos<=view.right);
  const kinds=Object.keys(markerNames).filter(kind=>markers.some(m=>m.kind===kind));
  const hasPav=Boolean(gene.pav?.length);
  function interval(left,right,color,y,h,key){
    if(left>view.right||right<view.left)return null;
    const start=scale(Math.max(left,view.left)),end=scale(Math.min(right,view.right));
    return <rect key={key} x={start} y={y} width={Math.max(1,end-start)} height={h} rx="2" fill={color}/>;
  }
  return <div className="genome-view">
    <div className="track-tools"><b>{localize(gene.chromosome)} · {localize(gene.assembly)}</b>
      <button type="button" aria-label={localize("向左平移")} onClick={()=>viewport(view.left-width/3,width)}>←</button>
      <button type="button" aria-label={localize("向右平移")} onClick={()=>viewport(view.left+width/3,width)}>→</button>
      <button type="button" onClick={()=>zoom(.5)}>{localize("放大")}</button><button type="button" onClick={()=>zoom(2)}>{localize("缩小")}</button>
      <button type="button" onClick={()=>setView(home)}>{localize("基因全景")}</button>
      <button type="button" onClick={()=>viewport(1,extent)}>{localize("整条染色体")}</button></div>
    <svg ref={svgRef} style={{'--track-font':(15*800/pixels)+'px'}} className="gene-track drag-track" viewBox={hasPav?'0 0 800 174':'0 0 800 150'} aria-label={localize(gene.name+' 基因结构和变异位置')} role="group"
      onPointerDown={e=>{if(e.button!==0)return;drag.current={x:e.clientX,left:view.left,id:e.pointerId};suppressClick.current=false;}}
      onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;
        const delta=e.clientX-d.x;if(Math.abs(delta)<3&&!suppressClick.current)return;
        suppressClick.current=true;e.currentTarget.setPointerCapture(e.pointerId);
        const pixels=e.currentTarget.getBoundingClientRect().width*710/800;viewport(d.left-delta*width/pixels,width);}}
      onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null} onPointerLeave={()=>{if(!suppressClick.current)drag.current=null;}}>
      {(pixels<650?[0,.5,1]:[0,.25,.5,.75,1]).map(t=><g key={t}><line x1={42+t*710} x2={42+t*710} y1="30" y2={hasPav?142:118} stroke="#e3eaec"/><text x={42+t*710} y={hasPav?162:139} className="axis" textAnchor={t===0?'start':t===1?'end':'middle'}>{localize(Math.round(view.left+t*(width-1)).toLocaleString())}</text></g>)}
      <text x="42" y="20" className="track-name">{localize(gene.name)} {localize(gene.strand==='+'?'→':gene.strand==='-'?'←':'')}</text>
      {centromere&&Number(centromere.position)>=view.left&&Number(centromere.position)<=view.right&&<g><line x1={scale(Number(centromere.position))} x2={scale(Number(centromere.position))} y1="28" y2="118" stroke="#bc8c55" strokeDasharray="4 3"/><text x={scale(Number(centromere.position))} y="22" textAnchor="middle" className="axis">{localize("约着丝粒")}</text></g>}
      {localize(gene.gene_start!=null&&interval(gene.gene_start,gene.gene_end,'#487e73',61,3,'body'))}
      {localize(promoter&&interval(promoter.start,promoter.end,'#cbded6',52,18,'promoter'))}
      {features.map((f,i)=>interval(f.start,f.end,'#659d8d',50,24,i))}
      {hasPav&&<g aria-label={localize("PAV 参考基因跨度")}>
        {localize(interval(gene.gene_start,gene.gene_end,'#977eaa',122,7,'pav'))}
        <title>{localize("PAV 测定对象 · 参考基因跨度")}</title>
      </g>}
      {visible.map(({v,kind,ref,alts})=>{
        const enabled=variants.includes(v),x=scale(v.pos),y=kind==='SNP'?93:112;
        const inspectable=kind!=='SNP'&&Boolean(onInspect),actionable=enabled||inspectable;
        const description=markerNames[kind]+' · '+v.pos.toLocaleString()+' bp · '+ref+' → '+(alts.join(' / ')||'—')+
          (!enabled&&inspectable?' · 未纳入当前组合':'');
        function activate(e){
          if(enabled)onSelect(v.id);
          if(inspectable)onInspect(v.id,e.currentTarget);
        }
        return <g key={v.id} role="button" tabIndex={actionable?0:-1} aria-disabled={!actionable}
          aria-haspopup={inspectable?'dialog':undefined} aria-label={localize((inspectable?'查看':'选择')+'位点 '+v.id)}
          aria-description={localize(description)} opacity={enabled ? 1 : inspectable ? .55 : .27}
          onClick={e=>{if(!suppressClick.current&&actionable)activate(e);}}
          onKeyDown={e=>{if(['Enter',' '].includes(e.key)&&actionable){e.preventDefault();activate(e);}}}>
          <line x1={x} x2={x} y1={y-11} y2={y-7} stroke="#839ead"/>
          <g transform={`translate(${x} ${y})`}>
            <circle r="8" fill="transparent"/>
            {v.id===selected?.id&&<circle r="8" fill="none" stroke="#284450" strokeWidth="1.4"/>}
            <MarkerGlyph kind={kind}/>
          </g>
          <title>{localize(description)} · {localize(v.id)}</title></g>;
      })}
    </svg>
    {(kinds.length>0||hasPav)&&<div className="variant-legend" aria-label={localize("变异标记图例")}>
      {kinds.map(kind=><span key={kind}><MarkerIcon kind={kind}/>{localize(markerNames[kind])}</span>)}
      {hasPav&&<span><i className="pav-key"/>PAV</span>}
    </div>}
    <p className="track-range">{localize("窗口")+" "}{localize(view.left.toLocaleString())}–{localize(view.right.toLocaleString())}{" "+localize("bp · 拖动平移 · 窗内")+" "}{localize("标记数 #0#", [visible.length])}</p>
  <details className="chromosome-context"><summary>{localize("染色体区段注释")}</summary><p>{localize("距最近染色体端")+" "}{localize(terminalDistance.toLocaleString())}{" "+localize("bp（全长的")+" "}{localize((relative*100).toFixed(1))}%）{relative<=.1?localize(" · 端部 10% 几何区域"):''} · {centromere?<a href={centromere.source} target="_blank" rel="noreferrer">{localize("着丝粒约")+" "}{localize((Number(centromere.position)/1e6).toFixed(1))} Mb</a>:'着丝粒位置未接入'}<small>{localize("近似点不代表功能边界；端部比例不等于重组率。")}</small></p></details></div>;
}
