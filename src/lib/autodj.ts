export type AutoDjMetadata={id:string;title:string;artist:string;genre:string;bpm:number;key:string;energy:number;popularity?:number;requests?:number;operatorAffinity?:number};
export type AutoDjIntent={targetEnergy:number;preferredGenre?:string;knownOnly?:boolean};

function harmonicCompatibility(a:string,b:string){const parse=(key:string)=>({n:Number.parseInt(key),mode:key.slice(-1).toUpperCase()});const x=parse(a),y=parse(b);if(!Number.isFinite(x.n)||!Number.isFinite(y.n))return .5;const ring=Math.min(Math.abs(x.n-y.n),12-Math.abs(x.n-y.n));if(ring===0&&x.mode===y.mode)return 1;if(ring===1&&x.mode===y.mode)return .82;if(ring===0&&x.mode!==y.mode)return .75;return Math.max(0,1-ring/4-(x.mode===y.mode?0:.15));}
function bpmCompatibility(a:number,b:number){const distances=[Math.abs(a-b),Math.abs(a-b*2),Math.abs(a*2-b)];return Math.max(0,1-Math.min(...distances)/12);}

export function scoreAutoDj(current:AutoDjMetadata,candidate:AutoDjMetadata,recentIds:string[],intent:AutoDjIntent){
  const sameGenre=current.genre.toLowerCase()===candidate.genre.toLowerCase();
  const matchesIntent=intent.preferredGenre?.toLowerCase()===candidate.genre.toLowerCase();
  const factors={bpm:bpmCompatibility(current.bpm,candidate.bpm),harmonic:harmonicCompatibility(current.key,candidate.key),genre:sameGenre?1:matchesIntent?.8:.35,energy:Math.max(0,1-Math.abs(intent.targetEnergy-candidate.energy)),popularity:Math.max(0,Math.min(1,candidate.popularity??.5)),requests:Math.max(0,Math.min(1,(candidate.requests??0)/10)),preference:Math.max(0,Math.min(1,.5+(candidate.operatorAffinity??0)))};
  const repetition=recentIds.includes(candidate.id)?.72:0;
  const knownBoost=intent.knownOnly?factors.popularity*.05:0;
  const score=Math.max(0,.26*factors.bpm+.20*factors.harmonic+.14*factors.genre+.13*factors.energy+.10*factors.popularity+.09*factors.requests+.08*factors.preference+knownBoost-repetition);
  return {score,factors,repetition};
}
