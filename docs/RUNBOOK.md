# Runbook operativo de cabina

## Preflight antes de abrir el local

1. Conectar alimentación estable/UPS y desactivar suspensión del equipo.
2. Seleccionar salida de audio y confirmar señal estéreo.
3. Cargar una playlist local de contingencia de al menos 30 minutos.
4. Verificar NOW, NEXT y al menos tres UPCOMING.
5. Confirmar `WATCHDOG HEALTHY`, espacio de IndexedDB y pista de cuña.
6. Desconectar Internet durante una canción y comprobar que Deck A/B continúan.
7. Reconectar y verificar QR/API sin reiniciar la sesión.

## Prueba soak de aceptación

- Duración mínima: 12 horas con el mismo navegador/equipo de producción.
- Biblioteca: al menos 100 archivos representativos de formatos y duraciones reales.
- Registrar gaps audibles, underruns, memoria, CPU, temperatura y recuperaciones.
- Inyectar: archivo corrupto, cierre de red, NEXT ausente, solicitud QR masiva y cuña vencida.
- Aceptación: cero detenciones por fallo recuperable, cero archivos bloqueados reproducidos, memoria estable y todas las decisiones trazables.

Comando de simulación lógica acelerada:

```bash
npm run test:phase15
```

## Respuesta a incidentes

- `DEGRADED`: cargar NEXT inmediatamente; la pista activa sigue al aire.
- `CRITICAL` con respaldo: watchdog intenta Deck alterno y aumenta `REC`.
- `CRITICAL` sin respaldo: cargar la playlist de emergencia y pulsar Play.
- Audio distorsionado: bajar TRIM; verificar peak meter y salida física.
- PWA sin actualizar: cerrar cabina cuando sea seguro, reabrir online y recargar.

## Limitaciones actuales

La prueba automatizada valida lógica, no continuidad acústica del hardware. PostgreSQL/Redis, análisis EBU R128/Essentia, telemetría central y pruebas E2E con dispositivo de audio permanecen como requisitos previos al piloto comercial.
