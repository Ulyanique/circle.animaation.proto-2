// Zero velocity AND acceleration at both joins (C2), unlike cubic smoothstep.
export function smoothMotion(a,b,time){
 const u=Math.max(0,Math.min(1,(time-a)/(b-a)));
 return Math.max(0,Math.min(1,u*u*u*(10+u*(-15+6*u))));
}

// Exact critically damped response for a constant target during this frame.
// Target jumps do not jump position or velocity; no overshoot for a resting start.
export function dampMotion(position,velocity,target,dt,frequency=6){
 const elapsed=Math.max(0,Math.min(.1,dt)),offset=position-target;
 const impulse=velocity+frequency*offset,decay=Math.exp(-frequency*elapsed);
 return {position:target+(offset+impulse*elapsed)*decay,velocity:(velocity-frequency*impulse*elapsed)*decay};
}
