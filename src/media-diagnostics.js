import { shots } from './media-config.js';

export function mediaWarning(index, type, mode, duration) {
 if(type!=='video'||mode!=='recording'||!Number.isFinite(duration))return '';
 const shot=shots[index];
 if(!shot)return '';
 if(duration<=shot.in)return 'Запись короче исходного таймкода. Выберите готовый фрагмент или загрузите полную запись.';
 if(shot.out!==null&&duration<shot.out)return 'Запись заканчивается раньше конца фрагмента. Будет использована доступная часть.';
 return '';
}
