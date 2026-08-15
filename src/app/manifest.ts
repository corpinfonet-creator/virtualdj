import type { MetadataRoute } from "next";

export default function manifest():MetadataRoute.Manifest{return{name:"AutoDJ AI",short_name:"AutoDJ",description:"Cabina AutoDJ inteligente con reproducción continua y operación offline.",start_url:"/",scope:"/",display:"standalone",orientation:"landscape",background_color:"#070a0f",theme_color:"#070a0f",categories:["music","entertainment","productivity"],icons:[{src:"/icon.svg",sizes:"any",type:"image/svg+xml",purpose:"any"},{src:"/icon-maskable.svg",sizes:"any",type:"image/svg+xml",purpose:"maskable"}]};}
