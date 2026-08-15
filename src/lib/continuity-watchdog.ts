import type { DeckId, DeckSnapshot } from "./audio-engine";

export type ContinuityHealth={level:"idle"|"healthy"|"degraded"|"critical";message:string;fallback?:DeckId};
export function evaluateContinuity(decks:Record<DeckId,DeckSnapshot>,active:DeckId,expected:boolean):ContinuityHealth{
  if(!expected)return{level:"idle",message:"Watchdog en espera"};const standby:DeckId=active==="A"?"B":"A",current=decks[active],next=decks[standby];
  if(!current.playing){if(next.ready)return{level:"critical",message:`Deck ${active} detenido; respaldo ${standby} disponible`,fallback:standby};return{level:"critical",message:"No hay deck reproduciendo ni respaldo listo"};}
  if(!next.ready)return{level:"degraded",message:`Deck ${active} al aire, pero NEXT no está precargado`};
  if(current.buffered<.02&&current.duration-current.currentTime>10)return{level:"degraded",message:`Buffer bajo en Deck ${active}; NEXT está disponible`,fallback:standby};
  return{level:"healthy",message:`Deck ${active} al aire · Deck ${standby} listo`};
}
