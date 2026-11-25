// ---- mobile nav ----
const nav=document.querySelector('.nav');
const toggle=document.querySelector('.nav-toggle');
toggle?.addEventListener('click',()=>{
  const open=nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded',open);
});
nav?.querySelectorAll('nav a').forEach(a=>a.addEventListener('click',()=>{
  nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');
}));

// ---- theme toggle (persisted; degrades gracefully if storage is blocked) ----
const root=document.documentElement;
const themeBtn=document.getElementById('theme-toggle');
function syncPressed(){themeBtn?.setAttribute('aria-pressed',root.getAttribute('data-theme')==='dark');}
syncPressed();
themeBtn?.addEventListener('click',()=>{
  const dark=root.getAttribute('data-theme')==='dark';
  if(dark){root.removeAttribute('data-theme');}else{root.setAttribute('data-theme','dark');}
  try{localStorage.setItem('theme',dark?'light':'dark');}catch(e){}
  syncPressed();
});

// ---- scroll reveal ----
const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
if(!reduce&&'IntersectionObserver'in window){
  const io=new IntersectionObserver((entries)=>{
    entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});
  },{threshold:.12});
  document.querySelectorAll('.band').forEach(b=>io.observe(b));
}else{
  document.querySelectorAll('.band').forEach(b=>b.classList.add('in'));
}

// ---- publication abstract / BibTeX toggles ----
document.querySelectorAll('.badge-toggle').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const panel=document.getElementById(btn.getAttribute('aria-controls'));
    const open=btn.getAttribute('aria-expanded')!=='true';
    btn.closest('.badges').querySelectorAll('.badge-toggle').forEach(b=>{
      b.setAttribute('aria-expanded','false');
      document.getElementById(b.getAttribute('aria-controls')).hidden=true;
    });
    btn.setAttribute('aria-expanded',open);
    panel.hidden=!open;
  });
});
document.querySelectorAll('.bib-copy').forEach(btn=>{
  btn.addEventListener('click',async()=>{
    const box=btn.closest('.pub-more');
    const msg=box.querySelector('.bib-msg');
    try{await navigator.clipboard.writeText(box.querySelector('.bib').textContent);msg.textContent='Copied';}
    catch(e){
      const r=document.createRange();r.selectNodeContents(box.querySelector('.bib'));
      const sel=getSelection();sel.removeAllRanges();sel.addRange(r);msg.textContent='Selected, press Ctrl+C';
    }
    setTimeout(()=>{msg.textContent='';},2000);
  });
});

// ---- publication topic filter ----
const chips=document.querySelectorAll('.pub-filters .chip');
chips.forEach(chip=>chip.addEventListener('click',()=>{
  const f=chip.dataset.filter;
  chips.forEach(c=>c.setAttribute('aria-pressed',c===chip));
  document.querySelectorAll('#publications .pubs').forEach(list=>{
    let shown=0;
    list.querySelectorAll('.pub').forEach(p=>{
      const hit=f==='all'||p.dataset.topics.split(' ').includes(f);
      p.hidden=!hit;if(hit)shown++;
    });
    list.hidden=!shown;
    const head=list.previousElementSibling;
    if(head&&head.classList.contains('sub'))head.hidden=!shown;
  });
}));
