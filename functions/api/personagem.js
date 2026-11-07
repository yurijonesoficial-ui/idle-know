// GET /api/personagem?nick=Nome — busca o personagem no Baiak Idle (dados públicos).
// Roda como Cloudflare Pages Function. Guarda a resposta por 5 minutos para não
// sobrecarregar o servidor do jogo.
const API = 'https://baiakidle.com/api/trpc/';
const HEADERS = { 'user-agent': 'IdleKnow/1.0 (busca de personagem pelo nick)' };

async function trpc(proc, input) {
  const url = `${API}${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: input }))}`;
  const r = await fetch(url, { headers: HEADERS, cf: { cacheTtl: 300 } });
  if (!r.ok) throw new Error(`jogo respondeu ${r.status}`);
  const j = await r.json();
  if (j[0] && j[0].error) throw new Error(j[0].error.message);
  return j[0].result.data;
}

const json = (obj, status = 200, maxAge = 300) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${maxAge}` },
});

export async function onRequestGet({ request, waitUntil }) {
  const url = new URL(request.url);
  const nick = (url.searchParams.get('nick') || '').trim().replace(/\s+/g, ' ');
  if (nick.length < 2 || nick.length > 30 || !/^[\p{L}\p{N} '\-._]+$/u.test(nick)) {
    return json({ erro: 'Digite um nick válido (2 a 30 letras).' }, 400, 0);
  }
  const cache = caches.default;
  const key = new Request(`${url.origin}/api/personagem?nick=${encodeURIComponent(nick.toLowerCase())}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  let res;
  try {
    const perfil = await trpc('characters.profile', { name: nick });
    if (perfil) {
      const { account, admin, ...publico } = perfil; // só o que é público do personagem
      res = json({ perfil: publico });
    } else {
      const lista = await trpc('characters.search', { name: nick });
      res = json({ perfil: null, sugestoes: (lista || []).slice(0, 10).map(c => ({ name: c.name, vocation: c.vocation, level: c.level })) });
    }
  } catch (e) {
    return json({ erro: 'Não consegui falar com o jogo agora. Tente de novo em instantes.' }, 502, 0);
  }
  waitUntil(cache.put(key, res.clone()));
  return res;
}
