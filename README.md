# Reparto de servicios (MVP)

HTML + CSS + JS sin build, con persistencia real en Supabase.

## Puesta en marcha
1. Crea un proyecto en Supabase y ejecuta `supabase/migrations.sql` en **SQL Editor** (crea tablas, 3 casas, unidades iniciales y RLS).
2. En **Authentication**: desactiva «Allow new users to sign up» y crea tus usuarios (correo + contraseña). Solo usuarios autenticados acceden a los datos (RLS).
3. `cp .env.example .env` y pon `SUPABASE_URL` y `SUPABASE_ANON_KEY` (clave pública *anon*; **nunca** la `service_role`).
4. `npm start` → genera `js/config.js` desde `.env` y sirve en http://localhost:8080 (o abre la carpeta con cualquier servidor estático).
5. Pruebas de cálculo: `npm test`.

## Despliegue en Netlify (sitio estático)
**Opción A – con Git (recomendada):** sube la carpeta a un repositorio, conéctalo en Netlify y en *Site settings → Environment variables* agrega `SUPABASE_URL` y `SUPABASE_ANON_KEY`. `netlify.toml` ya ejecuta `node scripts/make-config.js` al desplegar y publica la raíz.

**Opción B – arrastrar y soltar:** edita `js/config.js` con tu URL y anon key (`window.APP_CONFIG={url:"https://...supabase.co",anonKey:"..."};`) y arrastra la carpeta a https://app.netlify.com/drop. No hace falta build.

La anon key es pública por diseño; la seguridad la dan el login y las políticas RLS. En Supabase → Authentication → URL Configuration, agrega tu dominio de Netlify como *Site URL*.

## Arquitectura
- `js/calc.js`: reglas puras (testeadas). `js/db.js`: acceso a Supabase. `js/app.js`: interfaz.
- Importes en pesos enteros; los residuos se reparten con el método del mayor resto (desempate por orden de creación), así la suma siempre coincide con el recibo.
- Cada reparto guarda nombre, personas y regla en `bill_allocations` (snapshots): editar unidades no altera el historial.

## Reglas
| Casa | Agua / Gas | Luz | Basura |
|---|---|---|---|
| 1 | Personas | Directa al apartamento elegido | Personas |
| 2 | Partes iguales (activas) | Partes iguales | Partes iguales |
| 3 | Personas | Garaje 1 / Garaje 2 directos; contador compartido en partes iguales entre unidades con grupo `shared_apartments` | Dos recibos (`basura_1`/`basura_2`), cada uno por persona |

## Decisiones
- Se añadió `houses.code` (1–3) para ligar las reglas a la casa sin depender del nombre.
- Importe entero en COP (sin centavos). Aviso de duplicado por referencia + casa + servicio + contador.
- Si el guardado de repartos falla, se elimina el recibo para no dejar datos a medias.
- Pendiente fuera del MVP: transacción atómica vía RPC, edición/eliminación de recibos.
