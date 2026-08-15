export type EnergyDirection="up"|"down"|"steady";
export type SessionBlock={id:string;label:string;preferredGenre?:string;targetEnergy:number;durationMinutes?:number;energyDirection:EnergyDirection;knownOnly:boolean};
export type ParsedSessionIntent={blocks:SessionBlock[];summary:string};

const genreAliases:Record<string,string>={cumbia:"Cumbia",cumbias:"Cumbia",salsa:"Salsa",regueton:"Reguetón",reggaeton:"Reguetón",bachata:"Bachata",merengue:"Merengue",electronica:"Electrónica",rock:"Rock",pop:"Pop",huayno:"Huayno",urbana:"Urbano",urbano:"Urbano"};
const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

function parseBlock(text:string,index:number):SessionBlock{
  const normalized=normalize(text);const genre=Object.entries(genreAliases).find(([alias])=>new RegExp(`\\b${alias}\\b`).test(normalized))?.[1];
  const minutes=normalized.match(/(?:durante|por)\s+(\d{1,3})\s+min/)?.[1];
  const quiet=/tranquil|suave|baja energia|relajad/.test(normalized),high=/sube|alta energia|intens|fiesta|encender/.test(normalized),down=/baja progres|disminuye/.test(normalized);
  return{id:crypto.randomUUID(),label:text.trim()||`Bloque ${index+1}`,preferredGenre:genre,targetEnergy:quiet?.35:high?.82:.65,durationMinutes:minutes?Number(minutes):undefined,energyDirection:down?"down":/progres|poco a poco/.test(normalized)&&high?"up":"steady",knownOnly:/conocid|popular|hit/.test(normalized)};
}

export function parseSessionInstruction(input:string):ParsedSessionIntent{
  const chunks=input.split(/\b(?:despu[eé]s|luego|posteriormente)\b/gi).map(value=>value.replace(/^[,.:;\s]+/,"").trim()).filter(Boolean);
  const blocks=(chunks.length?chunks:[input]).map(parseBlock);
  return{blocks,summary:blocks.map((block,index)=>`${index+1}. ${block.preferredGenre??"Selección abierta"} · energía ${Math.round(block.targetEnergy*100)}%${block.durationMinutes?` · ${block.durationMinutes} min`:""}${block.energyDirection!=="steady"?` · curva ${block.energyDirection==="up"?"ascendente":"descendente"}`:""}`).join(" → ")};
}
