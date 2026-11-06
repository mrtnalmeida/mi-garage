# Mi Garage

App instalable (PWA) para el mantenimiento del auto y la moto: ruta, tablero para cargar km, misiones y un Copiloto que consulta los manuales.

- Frontend: Vite, sin framework. El código de la app está en `src/app.js` y el arranque (login, datos y Copiloto) en `src/main.js`.
- Datos: Supabase, tabla `garage_vehicles` (un JSON por vehículo, privado por usuario). Esquema en `supabase/schema.sql`.
- Copiloto: función de Vercel `api/copiloto.js`, que llama a la API de Claude. La clave queda solo en el servidor.
- Manuales: `public/manuales/*.json`.

## Puesta en marcha

1. En Supabase, abrí el SQL Editor y corré `supabase/schema.sql`.
2. En Vercel, importá este repo (framework Vite) y cargá en Settings > Environment Variables:
   - `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Supabase > Project Settings > API)
   - `ANTHROPIC_API_KEY`
   - `ALLOWED_EMAILS` (opcional): tu email, para que nadie más use el Copiloto.
3. Deploy. Abrí la URL en Chrome del celular, entrá con tu cuenta y elegí ⋮ > Instalar app.

## Desarrollo local

```
cp .env.example .env.local   # completar
npm install
npx vercel dev               # app + /api/copiloto
```
