export const SETTINGS_KEY='amber-scene-settings-v1';
export const settingGroups=[
 ['Просмотр',[
  ['speed','Скорость воспроизведения',1,.25,2,.05],['loop','Повторять ролик',true],
  ['pixelRatio','Качество / суперсэмплинг',1.8,.75,2.5,.05],['exposure','Экспозиция',.82,.2,1.8,.01],
  ['background','Цвет фона','#080705'],['graphiteBackground','Графитовые полигоны и мягкий свет',true],['graphiteStrength','Выраженность фоновой фактуры',1,0,2,.05],['fog','Глубинная дымка',true],
 ]],
 ['Световая стрела',[
  ['beam','Показывать стрелу',true],['tail','Световые нити',true],['tailStrength','Яркость хвоста',1,0,2,.05],
  ['tailWidth','Толщина нитей',1,.3,3,.05],['head','Яркое ядро',true],['headStrength','Яркость ядра',1,.1,3,.05],['star','Звёздчатые лучи',true],
  ['starSize','Размер звезды',3.8,.5,7,.1],['starStrength','Яркость звезды',.95,0,2,.05],
  ['halo','Мягкий ореол',true],['streak','Поперечный блик',true],['sparks','Искры следа',true],
  ['sparkStrength','Яркость искр',1,0,2,.05],['dust','Пыль у огонька',true],['localLight','Подсветка от огонька',true],
 ]],
 ['Орбиты по краям',[
  ['edgeOrbits','Показывать орбиты',true],['orbitParticles','Частицы орбит',true],
  ['orbitBrightness','Яркость орбит',1,0,3,.05],['orbitSize','Размер орбит',1,.5,1.6,.05],
  ['orbitSpeed','Скорость вращения',1,0,3,.05],
 ]],
 ['Медиа',[
  ['sectionedMedia','Секционная постановка медиа',true],['media','Показывать фото и видео',true],['frames','Металлические кромки',true],
  ['mediaBrightness','Яркость медиа',1,.3,1.5,.05],['mediaReveal','Плавное проявление',true],
 ]],
 ['Камера и свет',[
  ['cameraGuidance','Акцент камеры на медиа',true],['parallax','Реакция на курсор',true],['cameraRoll','Наклон камеры',true],
  ['fovOffset','Поправка угла обзора',0,-10,20,1],['environment','Отражённый свет',.16,0,.7,.01],
  ['keyLight','Основной свет',1,0,3,.05],
 ]],
 ['Постобработка',[
  ['bloom','Свечение',true],['bloomStrength','Интенсивность свечения',1,0,3,.05],
  ['dof','Глубина резкости',true],['dofStrength','Сила размытия',1,0,3,.05],
  ['ao','Контактные тени (ПК)',true],['vignette','Виньетка',true],['smaa','Сглаживание SMAA',true],
 ]],
 ['Финальная заставка',[
  ['finalFlash','Вспышка от попадания луча',true],['flashSparks','Искры вспышки',true],['flashStrength','Яркость вспышки',1,0,1.5,.05],['finale','Показывать финал',true],['title','Надпись',true],['compass','Циркуль',true],
  ['finalBackdrop','Графитовый фон финала',true],['engraving','Гравированная шкала',true],
 ]],
];
const fields=settingGroups.flatMap(([,fields])=>fields);
export const defaultSettings=Object.fromEntries(fields.map(([key,,value])=>[key,value]));
export function sanitizeSettings(input={}){
 const result={...defaultSettings};
 for(const [key,,value,min,max,step] of fields){
  const candidate=input?.[key];
  if(typeof value==='boolean' && typeof candidate==='boolean')result[key]=candidate;
  else if(typeof value==='number' && typeof candidate==='number' && Number.isFinite(candidate)){
   const bounded=Math.max(min,Math.min(max,candidate));
   result[key]=Number((min+Math.round((bounded-min)/step)*step).toFixed(4));
  }else if(typeof value==='string' && typeof candidate==='string' && /^#[0-9a-f]{6}$/i.test(candidate))result[key]=candidate;
 }
 return result;
}
export function loadSettings(storage){
 try{return sanitizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY)||'{}'));}catch{return {...defaultSettings};}
}

export function mountSettings(settings,onChange){
 const toggle=document.querySelector('#settings-toggle'),panel=document.querySelector('#settings-panel');
 const status=panel.querySelector('[role=status]');
 const importLabel=panel.querySelector('label[for=settings-import]');
 importLabel.tabIndex=0;importLabel.setAttribute('role','button');
 importLabel.onkeydown=event=>{if(event.code==='Enter'||event.code==='Space'){event.preventDefault();panel.querySelector('#settings-import').click();}};
 const controls=new Map();
 function save(){
  try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));status.textContent='Сохранено в этом браузере';}
  catch{status.textContent='Настройки применены; сохранение недоступно';}
  onChange();
 }
 function sync(){
  for(const [key,{input,output}] of controls){
   if(input.type==='checkbox')input.checked=settings[key];else input.value=settings[key];
   if(output)output.value=String(settings[key]);
  }
 }
 for(const [title,fields] of settingGroups){
  const section=document.createElement('details');section.open=title==='Световая стрела';
  const summary=document.createElement('summary');summary.textContent=title;section.append(summary);
  for(const [key,label,value,min,max,step] of fields){
   const row=document.createElement('label');row.className='setting-row';row.htmlFor=`setting-${key}`;
   const text=document.createElement('span');text.textContent=label;row.append(text);
   const input=document.createElement('input');input.id=`setting-${key}`;input.dataset.setting=key;
   input.type=typeof value==='boolean'?'checkbox':typeof value==='number'?'range':'color';
   let output;
   if(input.type==='range'){
    input.min=min;input.max=max;input.step=step;
    output=document.createElement('output');output.htmlFor=input.id;
    const wrap=document.createElement('div');wrap.className='setting-range';wrap.append(input,output);row.append(wrap);
   }else row.append(input);
   input.addEventListener('input',()=>{
    settings[key]=input.type==='checkbox'?input.checked:input.type==='range'?Number(input.value):input.value;
    if(output)output.value=String(settings[key]);save();
   });
   controls.set(key,{input,output});section.append(row);
  }
  panel.querySelector('.settings-body').append(section);
 }
 const nativePopover=typeof panel.showPopover==='function';
 const isOpen=()=>nativePopover?panel.matches(':popover-open'):!panel.hidden;
 function open(value){
  if(nativePopover){if(value&&!isOpen())panel.showPopover();else if(!value&&isOpen())panel.hidePopover();}
  else{panel.hidden=!value;toggle.setAttribute('aria-expanded',String(value));}
  if(value)panel.querySelector('#settings-close').focus();else toggle.focus();
 }
 if(nativePopover){
  // Declarative popovertarget handles mouse, touch and keyboard without a JS click handler.
  // Browser top layer keeps the drawer above the WebGL canvas and header stacking contexts.
  panel.addEventListener('toggle',event=>{
   toggle.setAttribute('aria-expanded',String(event.newState==='open'));
   if(event.newState==='open')panel.querySelector('#settings-close').focus();
  });
 }else{
  panel.hidden=true;
  toggle.onclick=()=>open(!isOpen());
  panel.querySelector('#settings-close').onclick=()=>open(false);
  document.addEventListener('pointerdown',event=>{
   if(isOpen()&&!panel.contains(event.target)&&!toggle.contains(event.target))open(false);
  });
 }
 document.addEventListener('keydown',event=>{
  if(!isOpen())return;
  if(event.target===importLabel&&(event.code==='Enter'||event.code==='Space')){event.preventDefault();event.stopImmediatePropagation();panel.querySelector('#settings-import').click();return;}
  if(event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();open(false);}
  else if(panel.contains(event.target))event.stopImmediatePropagation();
 },true);
 panel.querySelector('#settings-reset').onclick=()=>{Object.assign(settings,defaultSettings);sync();save();};
 panel.querySelector('#settings-export').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,settings},null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='amber-settings.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 panel.querySelector('#settings-import').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try{
   if(file.size>65536)throw new Error('Файл слишком большой');
   const data=JSON.parse(await file.text()),value=data.settings??data;
   if(!value||typeof value!=='object'||Array.isArray(value)||!fields.some(([key])=>Object.hasOwn(value,key)))throw new Error('Нет известных настроек');
   Object.assign(settings,sanitizeSettings(value));sync();save();status.textContent='Настройки импортированы';
  }catch{status.textContent='Не удалось импортировать. Выберите JSON настроек.';}
  event.target.value='';
 };
 sync();onChange();
}
