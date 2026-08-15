"use client";

import { ExternalLink, Play, Search, X } from "lucide-react";
import { FormEvent, useState } from "react";
type Result = { videoId: string; title: string; channelTitle: string; thumbnailUrl: string | null; watchUrl: string };

export function YouTubeDiscovery() {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<Result[]>([]); const [status, setStatus] = useState(""); const [loading, setLoading] = useState(false); const [selected, setSelected] = useState<Result | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (query.trim().length < 2) return; setLoading(true); setStatus("");
    try {
      const response = await fetch(`/api/providers/youtube/search?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const payload = await response.json() as { data?: Result[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo consultar YouTube.");
      setResults(payload.data ?? []); setStatus(payload.data?.length ? "" : "No se encontraron resultados.");
    } catch (error) { setResults([]); setStatus(error instanceof Error ? error.message : "No se pudo consultar YouTube."); } finally { setLoading(false); }
  }
  return <section className="panel rounded-2xl p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">Descubrir en YouTube</h3><p className="mt-1 text-xs text-slate-500">Catálogo externo · No se carga en los decks ni se descarga</p></div><span className="rounded-full bg-red-500/10 px-2 py-1 text-[10px] font-bold tracking-wider text-red-300">YOUTUBE</span></div>
    <form onSubmit={submit} className="mt-3 flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder="Artista o canción…" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-[#090d14] px-4 py-3 outline-none focus:border-cyan"/><button disabled={loading || query.trim().length < 2} className="rounded-xl bg-white px-4 text-ink disabled:opacity-40" aria-label="Buscar en YouTube"><Search size={18}/></button></form>
    {status && <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">{status}</p>}
    {selected && <div className="mt-4 overflow-hidden rounded-xl border border-red-500/30 bg-black">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2"><div className="min-w-0"><b className="block truncate text-sm">{selected.title}</b><small className="text-slate-400">{selected.channelTitle} · Reproductor oficial</small></div><button onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Cerrar reproductor"><X size={17}/></button></div>
      <div className="aspect-video"><iframe key={selected.videoId} className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(selected.videoId)}?autoplay=1&playsinline=1&rel=0`} title={`YouTube: ${selected.title}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>
    </div>}
    <div className="mt-3 grid gap-2 sm:grid-cols-2">{results.map((result) => <article key={result.videoId} className={`flex gap-3 rounded-xl border p-2 ${selected?.videoId === result.videoId ? "border-red-500/50 bg-red-500/5" : "border-slate-800"}`}><div className="h-14 w-24 shrink-0 rounded-lg bg-slate-800 bg-cover bg-center" style={result.thumbnailUrl ? { backgroundImage: `url(${result.thumbnailUrl})` } : undefined}/><div className="min-w-0 flex-1"><b className="block truncate text-sm" title={result.title}>{result.title}</b><small className="block truncate text-slate-500">{result.channelTitle}</small><div className="mt-1 flex flex-wrap gap-3"><button onClick={() => setSelected(result)} className="inline-flex items-center gap-1 text-xs font-semibold text-red-300 hover:underline"><Play size={11} fill="currentColor"/> Reproducir aquí</button><a href={result.watchUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-cyan hover:underline">Abrir <ExternalLink size={11}/></a></div></div></article>)}</div>
    <p className="mt-3 text-[11px] leading-relaxed text-slate-500">La reproducción se realiza en YouTube con sus controles y condiciones. AutoDJ no extrae, descarga, mezcla ni reproduce el audio en segundo plano.</p>
  </section>;
}
