// ---- Git 速查表交互 ----
const grid=document.getElementById('grid');
const legendEl=document.getElementById('legend');
const q=document.getElementById('q');
const countEl=document.getElementById('count');
const emptyEl=document.getElementById('empty');
const toast=document.getElementById('toast');

const TOTAL=DATA.reduce((n,c)=>n+c.items.length,0);

// 高亮命令中的占位参数 <...> 与子命令
function fmtCmd(cmd){
  let s=cmd.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  // 占位符 &lt;...&gt;  和  :&lt;...&gt;
  s=s.replace(/(:?&lt;[^&]*?&gt;)/g,'<span class="a">$1</span>');
  // 命令中以 $ / git 开头的前缀着色
  s=s.replace(/^(git)\b/,'<span class="p">$1</span>');
  return s;
}
function esc(t){return t.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}

// 渲染图例
legendEl.innerHTML=LEGEND.map(([k,v])=>
  `<div class="lg"><code>${esc(k)}</code><span>${esc(v)}</span></div>`).join('');

// 渲染卡片
function render(){
  grid.innerHTML=DATA.map((cat,ci)=>`
    <section class="card" data-cat="${ci}">
      <h2>${esc(cat.name)}<span class="n">${cat.items.length}</span></h2>
      <div class="rows">
        ${cat.items.map(([cmd,desc])=>`
          <button class="row" data-cmd="${cmd.replace(/"/g,'&quot;')}" data-text="${(cmd+' '+desc).toLowerCase().replace(/"/g,'&quot;')}">
            <span class="cmd">${fmtCmd(cmd)}</span>
            <span class="desc">${esc(desc)}</span>
            <span class="copy"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>复制</span>
          </button>`).join('')}
      </div>
    </section>`).join('');
}
render();

// 复制
let copyTimer;
function copy(btn){
  const text=btn.getAttribute('data-cmd');
  const done=()=>{
    document.querySelectorAll('.row.copied').forEach(r=>r.classList.remove('copied'));
    btn.classList.add('copied');
    toast.classList.add('show');
    clearTimeout(copyTimer);
    copyTimer=setTimeout(()=>{toast.classList.remove('show');btn.classList.remove('copied');},1400);
  };
  if(navigator.clipboard&&window.isSecureContext){
    navigator.clipboard.writeText(text).then(done).catch(()=>fallback(text,done));
  }else{fallback(text,done);}
}
function fallback(text,done){
  const ta=document.createElement('textarea');
  ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
  document.body.appendChild(ta);ta.select();
  try{document.execCommand('copy');done();}catch(e){}
  document.body.removeChild(ta);
}
grid.addEventListener('click',e=>{
  const btn=e.target.closest('.row');
  if(btn)copy(btn);
});

// 搜索过滤 + 高亮
function applyHighlight(row,term){
  const cmdEl=row.querySelector('.cmd');
  const descEl=row.querySelector('.desc');
  const rawCmd=row.getAttribute('data-cmd');
  const desc=descEl.textContent;
  cmdEl.innerHTML=fmtCmd(rawCmd);
  descEl.innerHTML=esc(desc);
  if(!term)return;
  const re=new RegExp('('+term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig');
  [cmdEl,descEl].forEach(el=>{
    el.innerHTML=el.innerHTML.replace(/(>|^)([^<]+)(?=<|$)/g,(m,p,txt)=>p+txt.replace(re,'<mark>$1</mark>'));
  });
}
function filter(){
  const term=q.value.trim().toLowerCase();
  let shown=0;
  document.querySelectorAll('.card').forEach(card=>{
    let vis=0;
    card.querySelectorAll('.row').forEach(row=>{
      const hit=!term||row.getAttribute('data-text').includes(term);
      row.style.display=hit?'block':'none';
      if(hit){vis++;shown++;applyHighlight(row,term);}
    });
    card.style.display=vis?'':'none';
  });
  emptyEl.classList.toggle('show',shown===0);
  countEl.innerHTML=term?`匹配 <b>${shown}</b> / ${TOTAL} 条命令`:`共 <b>${TOTAL}</b> 条常用命令，点击即可复制`;
}
filter();
q.addEventListener('input',filter);

// 快捷键：/ 聚焦，Esc 清空
document.addEventListener('keydown',e=>{
  if(e.key==='/'&&document.activeElement!==q){e.preventDefault();q.focus();}
  else if(e.key==='Escape'&&document.activeElement===q){q.value='';filter();q.blur();}
});
