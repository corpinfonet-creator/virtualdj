# AutoDJ AI

Primera vertical funcional de una cabina AutoDJ profesional y legal-first. Incluye dashboard desktop, Deck A/B, crossfader, cola bloqueable, transporte y recomendación explicable. La capa de datos usa PostgreSQL, Prisma 7, aislamiento multiempresa y sesiones JWT en cookies `httpOnly`.

El dashboard también incorpora un runtime Web Audio funcional: selecciona dos archivos autorizados desde tu computadora, pulsa Play en Deck A y deja activada la transición automática. Los archivos elegidos directamente en la cabina permanecen en el navegador y no se suben al servidor.

## Ejecutar

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`. Consulta `docs/ARCHITECTURE.md` para arquitectura, flujo, cumplimiento, mezcla, resiliencia y roadmap; `prisma/schema.prisma` contiene el modelo multiempresa inicial.

## Base de datos

Requiere Docker Desktop (o PostgreSQL 17 accesible). Con Docker disponible:

```bash
docker compose up -d postgres redis
npm run db:deploy
npm run db:seed
```

El seed crea el tenant `demo-tenant`, el local `demo-venue` y el usuario de desarrollo `admin@autodj.local`. Su contraseña inicial es `ChangeMe123!` y debe cambiarse antes de cualquier despliegue.

Endpoints iniciales:

- `GET /api/health`: salud del control plane y PostgreSQL.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- `GET /api/tracks?q=...` y `POST /api/tracks`, protegidos por sesión y tenant.

Los datos y pistas actuales son ficticios; la V1 no descarga ni reproduce audio de YouTube o Spotify.

## Motor de audio local

- Dos elementos precargados conectados a un único `AudioContext`.
- Gain bus independiente para Deck A y Deck B.
- Crossfade equal-power con curvas seno/coseno.
- Compresor/limitador conservador en el master.
- Transición configurable de 2 a 30 segundos.
- Failover al deck alterno cuando el activo reporta error.
- Liberación de Object URLs y cierre del contexto al desmontar la cabina.
- Trim independiente por deck sin interferir con el crossfader.
- Tempo de ±8% con preservación de tono soportada por el navegador.
- Cue memorizable y retorno inmediato por deck.
- Medidor de pico y visualización separada de buffer/reproducción.
- Selector de dispositivo de salida cuando `AudioContext.setSinkId` está disponible.
- Cola local en memoria con selección múltiple de archivos.
- Ordenamiento Drag & Drop, bloqueo, eliminación y “reproducir siguiente”.
- Inicio coordinado: NOW en Deck A y NEXT precargado en Deck B.
- Reposición automática del deck liberado después de cada transición.
- Omisión segura de archivos que el navegador no puede decodificar.
- AutoDJ determinista conectado a UPCOMING con score visible.
- Compatibilidad BPM normal y half/double-time, rueda Camelot, género y energía objetivo.
- Preferencia de género configurable e historial reciente con penalización por repetición.
- Metadatos locales editables hasta que el análisis automático los complete en la Fase 9.
- Análisis offline en Web Worker: BPM, confianza, tonalidad Camelot estimada, energía, pico, LUFS aproximado y waveform.
- Downmix y reducción de frecuencia antes del worker para limitar consumo de CPU/memoria.

Las mediciones del navegador son útiles para recomendación y preclasificación, pero no sustituyen un análisis profesional Essentia/FFmpeg. LUFS es una aproximación RMS sin gating EBU R128 y la tonalidad debe revisarse cuando la confianza sea baja.

## Plan musical inteligente

AI AutoDJ interpreta instrucciones operativas en español y las convierte en bloques verificables: género, energía, duración, curva ascendente/descendente y preferencia por canciones populares. Las palabras “después”, “luego” y “posteriormente” crean bloques sucesivos. El ranking incorpora solicitudes y afinidad aprendida del feedback positivo/negativo del operador. Este aprendizaje es local y acotado; no reemplaza los filtros de licencia ni la compatibilidad musical.

## Playlists e historial offline

Las playlists se guardan en IndexedDB junto con sus archivos locales, metadatos analizados, favoritos y bloqueos. La aplicación solicita almacenamiento persistente cuando el navegador lo permite. La lista negra excluye pistas del AutoDJ y el historial conserva hora, artista, BPM, género y tipo de selección. Estos datos pertenecen al perfil/origen del navegador y deben respaldarse o sincronizarse con PostgreSQL antes de operar en múltiples cabinas.

## Jingles y cuñas

Las cuñas usan un tercer bus independiente de Deck A/B. Pueden emitirse manualmente o programarse por intervalo; una cuña vencida espera al siguiente límite de transición. Durante el anuncio el bus musical aplica ducking configurable y recupera el nivel con una rampa suave. Archivo, programación, habilitación y última/próxima emisión persisten en IndexedDB.

## Solicitudes QR

La ruta pública `/request/demo-venue` permite solicitar y votar canciones. Solicitudes iguales pendientes se consolidan; el endpoint público limita ocho operaciones por minuto y valida longitudes. La cabina acepta o rechaza, y al aceptar intenta priorizar una coincidencia ya autorizada en la cola. En desarrollo, las solicitudes se comparten mediante un JSON con escrituras atómicas dentro de `.data/`; en producción este adaptador debe sustituirse por PostgreSQL/Redis y autenticación completa de la consola. La administración local se limita a peticiones cuyo `Host` sea localhost.

## Instalación PWA y offline

El Service Worker precarga la interfaz y aplica network-first a navegaciones, con fallback offline; APIs, peticiones QR y requests con rangos de audio nunca se cachean. Los bundles versionados usan cache-first. La cola activa se checkpointa en IndexedDB y se recupera tras reiniciar, pero Play requiere un clic por las políticas de autoplay. La instalación funciona en `localhost`; para acceder o instalar desde otros equipos se requiere HTTPS con certificado válido.

## Continuidad y pruebas

El watchdog clasifica la salida como IDLE, HEALTHY, DEGRADED o CRITICAL. Un stall de cinco segundos activa failover si el deck alterno está listo y el contador `REC` registra recuperaciones. `npm run test:phase15` valida scoring, instrucciones, estados del watchdog y 10.000 transiciones AutoDJ aceleradas. La prueba acústica de 12 horas se define en `docs/RUNBOOK.md` y debe ejecutarse sobre el hardware real antes de un piloto.
