import fs from 'node:fs';
import postcss from 'postcss';
// Keep the installed, compiled Radix rules used by this app; no hand-written dialog behaviour.
const components=new Set(['BaseButton','BaseCheckbox','BaseDialog','Button','Checkbox','Dialog','Select','Switch','TextField','Text','Heading','ScrollArea','Popper']);
const colors=new Set(['gray','slate','blue']);
const unusedColors='mauve sage olive sand amber bronze brown crimson cyan gold grass green indigo iris jade lime mint orange pink plum purple red ruby sky teal tomato violet yellow'.split(' ');
const original=fs.readFileSync(new URL('../node_modules/@radix-ui/themes/styles.css',import.meta.url),'utf8');
const root=postcss.parse(original);
root.walkRules(rule=>{
  const selectors=rule.selectors.filter(selector=>{
    const classes=[...selector.matchAll(/\.rt-([A-Z][A-Za-z0-9]*)/g)].map(m=>m[1]);
    const palette=[...selector.matchAll(/data-(?:accent|gray)-color\s*=\s*['"]?([a-z]+)/g)].map(m=>m[1]);
    return classes.every(c=>[...components].some(prefix=>c.startsWith(prefix)))&&palette.every(c=>colors.has(c));
  });
  if(!selectors.length)rule.remove();else rule.selectors=selectors;
});
root.walkDecls(d=>{if(unusedColors.some(color=>d.prop.startsWith('--'+color+'-')))d.remove();});
root.walkComments(c=>c.remove());
root.walkRules(r=>{if(!r.nodes.length)r.remove();});
const output='/* Generated from @radix-ui/themes (MIT). Run node scripts/build-theme.mjs. */\n'+root.toString();
fs.writeFileSync(new URL('../src/explorer/theme.css',import.meta.url),output);
console.log(`Radix CSS: ${Buffer.byteLength(original)} → ${Buffer.byteLength(output)} bytes`);
