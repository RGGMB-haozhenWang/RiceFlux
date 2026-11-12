(() => {
  const escape=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let pending;
  const table=(head,rows)=>'<div class="scroll"><table class="matrix"><thead><tr>'+head.map(v=>'<th>'+escape(v)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+escape(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  window.showSourceGroups=async gene=>{
    const root=document.querySelector('#groupPanel');
    root.innerHTML='<h2>来源组比较</h2><p>正在读取群体汇总……</p>';
    if(!pending)pending=fetch('./groups.json').then(r=>{if(!r.ok)throw Error(r.status);return r.json()}).catch(err=>{pending=null;throw err});
    let d;
    try{d=await pending}catch(err){if(root.isConnected){root.innerHTML='<h2>来源组比较</h2><button class="action">重试加载</button>';root.querySelector('button').onclick=()=>window.showSourceGroups(gene)}return}
    if(!root.isConnected)return;
    const sites=d.markerCounts.filter(s=>s.gene===gene.id),haps=d.haplotypeCounts.filter(s=>s.gene===gene.id),traits=d.phenotypeMeans;
    const unique=(xs,key)=>[...new Map(xs.map(x=>[x[key],x])).values()];
    const picker=(id,label,items,disabled='')=>'<label class="field" for="'+id+'">'+label+'</label><select class="pick" id="'+id+'" '+disabled+'>'+items.map(([key,label])=>'<option value="'+escape(key)+'">'+escape(label)+'</option>').join('')+'</select>';
    const menu=unique(sites,'pos').map(s=>['s'+s.pos,s.chr+':'+s.pos+' · REF '+s.reference]);
    const hm=unique(haps,'event').map(h=>['h'+h.event,h.label]);
    const env=unique(traits,'column').map(e=>[e.column,e.trait+' · '+e.site+' '+e.year+' ('+e.column+')']);
    root.innerHTML='<h2>来源组比较</h2><p class="sub">'+d.groups.map(x=>x.group+' '+x.n+' 份').join('　')+'</p>'+(menu.length||hm.length?picker('groupMarker','目标位点或可比较的纯合组合',[...hm,...menu]):'<p>该基因在此面板缺少可比较的目标位点。</p>')+'<div id="groupGenotypes"></div>'+picker('groupEnv','群体实测表型与环境',[['','选择性状、地点和年份'],...env])+'<div id="groupTraits"></div><p class="sub">表型均值按该环境中实际有测量的材料汇总，样本不足 10 份时只显示人数。此处为来源组描述统计，基因效应见上方环境与分型对照。</p>';
    const target=root.querySelector('#groupMarker'), endpoint=root.querySelector('#groupEnv');
    function genotype(){
      if(!target)return;
      const k=target.value.slice(1),h=target.value.startsWith('h');
      const list=h?haps.filter(x=>x.event===k):sites.filter(x=>String(x.pos)===k);
      const fields=h?['match','other','het','missing']:['A','C','G','T','het','missing'];
      const labels=h?['纯合匹配','其他完整纯合','未分相杂合','缺失']:['A/A','C/C','G/G','T/T','杂合','缺失'];
      root.querySelector('#groupGenotypes').innerHTML=table(['来源组','分型材料数',...labels],list.map(x=>[x.group,x.n,...fields.map(k=>x[k])]));
    }
    function phenotype(){
      const e=endpoint.value;
      root.querySelector('#groupTraits').innerHTML=e?table(['来源组','实测材料数','均值'],traits.filter(t=>t.column===e).map(t=>[t.group,t.n,t.mean])):'';
    }
    if(target)target.onchange=genotype;
    const relevant=gene.tests?.find(x=>x.status==='estimated')||gene.tests?.[0];if(relevant&&env.some(x=>x[0]===relevant.column))endpoint.value=relevant.column;
    endpoint.onchange=phenotype;genotype();phenotype();
  };
})();
