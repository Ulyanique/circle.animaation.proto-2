export function mountCinemaView({togglePlayback}){
 const app=document.querySelector('#app'),toggle=document.querySelector('#cinema-toggle'),exit=document.querySelector('#cinema-exit');
 const chrome=[app.querySelector('header'),app.querySelector('footer')];
 let active=false,timer;
 function revealExit(){
  if(!active)return;
  exit.classList.add('awake');clearTimeout(timer);
  timer=setTimeout(()=>exit.classList.remove('awake'),1800);
 }
 function setActive(value){
  active=value;clearTimeout(timer);app.classList.toggle('cinema-view',active);
  toggle.setAttribute('aria-pressed',String(active));exit.hidden=!active;
  for(const element of chrome)element.inert=active;
  if(active){exit.focus({preventScroll:true});revealExit();}
  else {exit.classList.remove('awake');toggle.focus({preventScroll:true});}
 }
 toggle.onclick=()=>setActive(true);exit.onclick=()=>setActive(false);
 window.addEventListener('pointermove',revealExit,{passive:true});
 window.addEventListener('pointerdown',revealExit,{passive:true});
 window.addEventListener('keydown',event=>{
  if(event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;
  if(active&&(event.code==='Escape'||event.code==='KeyH')){
   event.preventDefault();event.stopImmediatePropagation();setActive(false);return;
  }
  if(active&&event.code==='Space'){
   event.preventDefault();event.stopImmediatePropagation();togglePlayback();return;
  }
  if(event.code!=='KeyH'||event.target.closest('input,select,textarea,[contenteditable=true]'))return;
  if(document.querySelector('[role=dialog]:not([hidden]),:popover-open')||!document.querySelector('#reference').hidden)return;
  event.preventDefault();setActive(true);
 },true);
}
