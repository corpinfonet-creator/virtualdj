import assert from "node:assert/strict";
import { scoreAutoDj, type AutoDjMetadata } from "../src/lib/autodj";

const current:AutoDjMetadata={id:"now",title:"Actual",artist:"A",genre:"Cumbia",bpm:96,key:"8A",energy:.65};
const compatible:AutoDjMetadata={id:"good",title:"Compatible",artist:"B",genre:"Cumbia",bpm:98,key:"8A",energy:.7};
const incompatible:AutoDjMetadata={id:"bad",title:"Incompatible",artist:"C",genre:"Rock",bpm:135,key:"2B",energy:.2};
const intent={targetEnergy:.7,preferredGenre:"Cumbia"};

const good=scoreAutoDj(current,compatible,[],intent);
const bad=scoreAutoDj(current,incompatible,[],intent);
assert.ok(good.score>bad.score,"la candidata compatible debe obtener mayor score");
assert.ok(scoreAutoDj(current,compatible,[compatible.id],intent).score<good.score,"la repetición reciente debe penalizarse");
assert.equal(good.factors.harmonic,1,"la misma tonalidad Camelot debe ser totalmente compatible");
console.log("AutoDJ scoring: OK");
