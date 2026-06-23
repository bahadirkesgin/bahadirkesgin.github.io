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
