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

// ---- publication abstract / BibTeX toggles ----
document.querySelectorAll('.pub-links .link-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const open=btn.getAttribute('aria-expanded')!=='true';
    btn.closest('.pub-links').querySelectorAll('.link-btn').forEach(b=>{
      b.setAttribute('aria-expanded','false');
      document.getElementById(b.getAttribute('aria-controls')).hidden=true;
    });
    btn.setAttribute('aria-expanded',open);
    document.getElementById(btn.getAttribute('aria-controls')).hidden=!open;
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

// ---- figure thumbnails open the paper's interactive figure ----
document.querySelectorAll('.thumb-btn').forEach(btn=>{
  btn.addEventListener('click',()=>btn.closest('.pub').querySelector('.lab-toggle').click());
});
