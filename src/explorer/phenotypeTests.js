// Upper-tail probabilities for Welch F and the rank-test chi-squared approximation.
const lanczos=[676.5203681218851,-1259.1392167224028,771.3234287776531,-176.6150291621406,
  12.5073432786869,-0.13857109526572,9.98436957801957e-6,1.50563273514931e-7];
const tiny=1e-300,epsilon=2e-14;
const nonzero=x=>Math.abs(x)<tiny?(x<0?-tiny:tiny):x;
function logGamma(z){
  if(z<.5)return Math.log(Math.PI/Math.sin(Math.PI*z))-logGamma(1-z);
  const x=z-1,t=x+7.5;
  const series=lanczos.reduce((sum,c,i)=>sum+c/(x+i+1),0.99999999999980993);
  return .5*Math.log(2*Math.PI)+(x+.5)*Math.log(t)-t+Math.log(series);
}
function betaFraction(x,a,b){
  let c=1,d=1/nonzero(1-(a+b)*x/(a+1)),value=d;
  for(let m=1;m<=500;m++){
    const even=2*m;
    for(const term of [m*(b-m)*x/((a+even-1)*(a+even)), -(a+m)*(a+b+m)*x/((a+even)*(a+even+1))]){
      d=1/nonzero(1+term*d);
      c=nonzero(1+term/c);
      value*=d*c;
    }
    if(Math.abs(d*c-1)<epsilon)return value;
  }
  return NaN;
}
function betaCdf(x,a,b){
  if(x<=0)return 0;
  if(x>=1)return 1;
  const scale=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log1p(-x));
  return x<(a+1)/(a+b+2)?scale*betaFraction(x,a,b)/a:1-scale*betaFraction(1-x,b,a)/b;
}
function gammaUpper(a,x){
  if(x<=0)return 1;
  const scale=Math.exp(a*Math.log(x)-x-logGamma(a));
  if(x<a+1){
    let term=1/a,sum=term;
    for(let n=1;n<=1000;n++){
      term*=x/(a+n);sum+=term;
      if(Math.abs(term)<Math.abs(sum)*epsilon)return 1-sum*scale;
    }
  }else{
    let b=x+1-a,c=1/tiny,d=1/nonzero(b),factor=d;
    for(let n=1;n<=1000;n++){
      const term=n*(a-n);b+=2;
      d=1/nonzero(b+term*d);c=nonzero(b+term/c);
      const step=d*c;factor*=step;
      if(Math.abs(step-1)<epsilon)return factor*scale;
    }
  }
  return NaN;
}

function moments(xs){
  let mean=0,ss=0,n=0;
  for(const x of xs){n++;const delta=x-mean;mean+=delta/n;ss+=delta*(x-mean);}
  return {n,mean,variance:n>1?ss/(n-1):null};
}

function welch(groups){
  const summaries=groups.map(g=>moments(g.values)),k=summaries.length;
  if(summaries.some(s=>!(s.variance>0)))return {status:'zero_within_group_variance'};
  const weights=summaries.map(s=>s.n/s.variance),total=weights.reduce((a,b)=>a+b,0);
  const mean=summaries.reduce((sum,s,i)=>sum+s.mean*weights[i],0)/total;
  const correction=summaries.reduce((sum,s,i)=>sum+(1-weights[i]/total)**2/(s.n-1),0);
  const statistic=summaries.reduce((sum,s,i)=>sum+weights[i]*(s.mean-mean)**2,0)/
    ((k-1)*(1+2*(k-2)*correction/(k*k-1)));
  const df1=k-1,df2=(k*k-1)/(3*correction);
  return {statistic,df1,df2,p:betaCdf(df2/(df2+df1*statistic),df2/2,df1/2)};
}

function kruskal(groups){
  const ranks=Array(groups.length).fill(0);
  const observations=groups.flatMap((group,i)=>group.values.map(value=>({value,i}))).sort((a,b)=>a.value-b.value);
  const n=observations.length;
  let ties=0;
  for(let i=0;i<n;){
    let j=i+1;
    while(j<n&&observations[i].value===observations[j].value)j++;
    for(let z=i;z<j;z++)ranks[observations[z].i]+=(i+1+j)/2;
    ties+=(j-i)**3-(j-i);i=j;
  }
  const correction=1-ties/(n**3-n);
  if(!(correction>0))return {status:'all_tied'};
  const statistic=Math.max(0,(12/(n*(n+1))*ranks.reduce((sum,r,i)=>sum+r*r/groups[i].values.length,0)-3*(n+1))/correction);
  const df1=groups.length-1;
  return {statistic,df1,p:gammaUpper(df1/2,statistic/2)};
}

const methods=[['welch',welch],['kruskal',kruskal]];
export const minimumGroupN=5;
export function phenotypeComparison(groups,endpoints){
  const tests=[],counts=[];
  for(const endpoint of endpoints){
    const {id,assay,unit,source}=endpoint;
    const context={environment_id:id,dataset_id:source.dataset_id||'',site:source.site,year:source.year,assay,unit};
    const measured=groups.map((group,i)=>({label:group.label||'G'+String(i+1).padStart(2,'0'),
      definition:group.tokens?.join(' | ')||group.key,values:group.members.map(s=>s.phenotypes[id]).filter(Number.isFinite)}));
    const eligible=measured.filter(g=>g.values.length>=minimumGroupN);
    for(const group of measured){
      const {n,mean,variance}=moments(group.values);
      counts.push({...context,group:group.label,definition:group.definition,n,mean:n?mean:null,sd:variance===null?null:Math.sqrt(variance),included:n>=minimumGroupN});
    }
    for(const [method,calculate] of methods){
      let result={status:'too_few_groups'};
      if(eligible.length>=2){
        if(method==='welch'&&unit==='级')result={status:'ordinal_scale'};
        else if(method==='welch'&&unit==='原表单位未注明')result={status:'unknown_scale'};
        else result=calculate(eligible);
        if(!result.status)result.status=Number.isFinite(result.p)?'estimated':'numerical_limit';
      }
      tests.push({...context,method,n:eligible.reduce((n,g)=>n+g.values.length,0),group_n:eligible.length,
        excluded_groups:measured.length-eligible.length,...result,holm:null});
    }
  }
  // One test family per method across estimable endpoints in this year/assay view.
  for(const [method] of methods){
    const family=tests.filter(r=>r.method===method&&r.status==='estimated').sort((a,b)=>a.p-b.p);
    let adjusted=0;
    family.forEach((row,i)=>{row.p=Math.max(0,Math.min(1,row.p));adjusted=Math.min(1,Math.max(adjusted,(family.length-i)*row.p));row.holm=adjusted;row.family_size=family.length;});
  }
  return {tests,counts};
}
