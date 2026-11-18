const hues = [155, 273, 24, 208, 335, 179, 44, 236];
const groupLevels = [36, 48, 29, 59, 41, 53, 33];

export function datasetBadge(id, registry=[]) {
  const index=registry.findIndex(entry=>entry.id===id);
  return index>=0?'D'+(index+1):id;
}

export function datasetHue(id, registry=[]) {
  const index=registry.findIndex(entry=>entry.id===id);
  if(index>=0)return hues[index] ?? (155+index*137.508)%360;
  if(id==='rice6044')return hues[0];
  if(id==='ricenavi404')return hues[1];
  return [...id].reduce((h,c)=>(h*31+c.charCodeAt(0))%360,0);
}

export function sourceColor(id, registry, level=0) {
  return `hsl(${datasetHue(id,registry)} 44% ${groupLevels[level%groupLevels.length]}%)`;
}

export function datasetTint(id, registry) {
  return {'--data-hue':datasetHue(id,registry)};
}
