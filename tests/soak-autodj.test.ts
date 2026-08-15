import assert from "node:assert/strict";
import { scoreAutoDj, type AutoDjMetadata } from "../src/lib/autodj";
let seed=20260811;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
const genres=["Cumbia","Salsa","Bachata","Urbano"],keys=["8A","9A","10A","8B","7A","2B"];
const catalog:AutoDjMetadata[]=Array.from({length:120},(_,i)=>({id:`track-${i}`,title:`Track ${i}`,artist:`Artist ${i%35}`,genre:genres[i%genres.length],bpm:75+Math.round(random()*65),key:keys[i%keys.length],energy:.25+random()*.7,popularity:random(),requests:Math.floor(random()*8)}));
let current=catalog[0];const recent:string[]=[];
for(let transition=0;transition<10000;transition++){const candidates=catalog.filter(item=>item.id!==current.id);const ranked=candidates.map(candidate=>({candidate,result:scoreAutoDj(current,candidate,recent,{targetEnergy:.3+random()*.65,preferredGenre:genres[transition%genres.length]} )})).sort((a,b)=>b.result.score-a.result.score);const winner=ranked[0];assert.ok(winner);assert.ok(Number.isFinite(winner.result.score));assert.ok(winner.result.score>=0);assert.notEqual(winner.candidate.id,current.id);recent.push(current.id);if(recent.length>20)recent.shift();current=winner.candidate;}
console.log("AutoDJ accelerated soak (10,000 transitions): OK");
