// Genera js/config.js con la URL y la anon key (públicas).
// Lee variables de entorno (Netlify) o, si no existen, el archivo .env (local).
const fs = require('fs');
let env = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY };
if ((!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) && fs.existsSync('.env')) {
  fs.readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).forEach((l) => {
    const i = l.indexOf('='); env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
  });
}
if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) { console.error('Faltan SUPABASE_URL y/o SUPABASE_ANON_KEY'); process.exit(1); }
fs.writeFileSync('js/config.js', `window.APP_CONFIG=${JSON.stringify({ url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY })};\n`);
console.log('js/config.js generado');
