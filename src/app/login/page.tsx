"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Headphones, LoaderCircle, LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const router = useRouter(); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
      const body = await response.json();
      if (!response.ok) throw new Error(response.status === 503 ? "PostgreSQL aún no está disponible." : body.error === "INVALID_CREDENTIALS" ? "Credenciales incorrectas." : "No fue posible iniciar sesión.");
      router.push("/library"); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error inesperado."); }
    finally { setLoading(false); }
  }
  return <main className="grid min-h-screen place-items-center p-5"><section className="panel w-full max-w-md rounded-3xl p-7">
    <div className="mb-7 flex items-center gap-3"><span className="rounded-xl bg-cyan/15 p-3 text-cyan"><Headphones/></span><div><h1 className="text-2xl font-black">AutoDJ <span className="text-cyan">AI</span></h1><p className="text-sm text-slate-500">Acceso seguro a la cabina</p></div></div>
    <form onSubmit={submit} className="space-y-4"><label className="block text-sm text-slate-300">Empresa<input name="tenantId" defaultValue="demo-tenant" required className="mt-1 w-full rounded-xl border border-slate-700 bg-ink px-4 py-3 outline-none focus:border-cyan"/></label>
      <label className="block text-sm text-slate-300">Correo<input name="email" type="email" defaultValue="admin@autodj.local" required className="mt-1 w-full rounded-xl border border-slate-700 bg-ink px-4 py-3 outline-none focus:border-cyan"/></label>
      <label className="block text-sm text-slate-300">Contraseña<input name="password" type="password" required minLength={8} className="mt-1 w-full rounded-xl border border-slate-700 bg-ink px-4 py-3 outline-none focus:border-cyan"/></label>
      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan py-3 font-bold text-ink disabled:opacity-60">{loading?<LoaderCircle className="animate-spin" size={18}/>:<LockKeyhole size={18}/>} Ingresar</button></form>
    <Link href="/" className="mt-5 block text-center text-sm text-slate-500 hover:text-cyan">Volver a la cabina en modo local</Link>
  </section></main>;
}
