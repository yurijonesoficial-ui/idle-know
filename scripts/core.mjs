// Núcleo do Idle-Know: lê o market público do Baiak Idle e gera os resumos.
// Sem dependências — roda no Node 20+ (GitHub Actions) e também no navegador.

export const API = 'https://baiakidle.com/api/trpc/';
export const DAY = 864e5;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function trpc(proc, input, { fetchFn = fetch, headers = {} } = {}) {
  const url = `${API}${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: input }))}`;
  for (let tentativa = 1; ; tentativa++) {
    const r = await fetchFn(url, { headers });
    if (r.ok) {
      const j = await r.json();
      if (j[0] && j[0].error) throw new Error(`${proc}: ${j[0].error.message}`);
      return j[0].result.data;
    }
    if (tentativa >= 3 || (r.status < 500 && r.status !== 429)) throw new Error(`${proc}: HTTP ${r.status}`);
    await sleep(3000 * tentativa);
  }
}

// ---------- coleta ----------
// Linha compacta de venda: [id, tipo('g'|'i'), nome|ouro, qtd, raridade, preço, terminaEm, lances, lanceInicial, upgrade, forja]
export function toRow(x) {
  return x.type === 'gold'
    ? [x.id, 'g', x.goldAmount, 0, 0, x.currentPrice, x.endsAt, x.bidCount, x.startPrice, 0, 0]
    : [x.id, 'i', x.item.name, x.item.qty || 0, x.item.tier || 0, x.currentPrice, x.endsAt, x.bidCount, x.startPrice, x.item.upLevel || 0, x.item.ftier || 0];
}

// Histórico incremental: vai da venda mais nova para a mais velha e para quando
// encontra uma página inteira de vendas que já conhecemos.
export async function pullHistory(known, { pause = 400, log = () => {}, ...opt } = {}) {
  const novas = []; let page = 1, total = Infinity, vistos = 0;
  while (vistos < total && page <= 200) {
    const d = await trpc('auction.history', { sort: 'ends_desc', page, perPage: 100 }, opt);
    total = d.total; vistos += d.rows.length;
    if (!d.rows.length) break;
    let conhecidas = 0;
    for (const x of d.rows) { if (known.has(x.id)) conhecidas++; else { novas.push(toRow(x)); known.add(x.id); } }
    log(`histórico p${page}: ${d.rows.length - conhecidas} novas`);
    if (conhecidas === d.rows.length) break;
    page++; await sleep(pause);
  }
  return novas;
}

export async function pullBrowse({ pause = 400, log = () => {}, ...opt } = {}) {
  const rows = []; let page = 1, total = Infinity;
  while (rows.length < total && page <= 100) {
    const d = await trpc('auction.browse', { sort: 'ends_asc', page, perPage: 100 }, opt);
    total = d.total; if (!d.rows.length) break;
    rows.push(...d.rows); page++; await sleep(pause);
  }
  log(`anúncios abertos: ${rows.length}`);
  return rows;
}

// ---------- estatística ----------
const S = a => [...a].sort((x, y) => x - y);
const qt = (s, p) => s[Math.floor((s.length - 1) * p)];
const md = s => { const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const r3 = x => x == null ? null : (x >= 10 ? Math.round(x) : Math.round(x * 1000) / 1000);
export const dayOf = t => new Date(t - 3 * 3600e3).toISOString().slice(0, 10); // dia em Brasília
export const monthOf = t => dayOf(t).slice(0, 7);
export function nextMonthStart(m) { const [y, mo] = m.split('-').map(Number); return Date.UTC(mo === 12 ? y + 1 : y, mo === 12 ? 0 : mo, 1) + 3 * 3600e3; }
const blk = t => Math.floor(((new Date(t).getUTCHours() + 21) % 24) / 3);
const stat4 = a => { const s = S(a); return [s.length, r3(md(s)), r3(qt(s, .25)), r3(qt(s, .75))]; };
const isGold = r => r[1] === 'g', goldVal = r => r[5] / (r[2] / 1e8), unitVal = r => r[5] / r[3];

function series(list, val, days) {
  const hb = Array.from({ length: 8 }, () => []), db = Object.fromEntries(days.map(d => [d, []]));
  list.forEach(r => { hb[blk(r[6])].push(val(r)); const d = dayOf(r[6]).slice(5); if (db[d]) db[d].push(val(r)); });
  return [hb.map(a => a.length ? r3(md(S(a))) : null), days.map(d => db[d].length ? r3(md(S(db[d]))) : null), hb.map(a => a.length)];
}
function groupItems(rows) {
  const sg = {}, eg = {};
  rows.filter(r => !isGold(r)).forEach(r => {
    if (r[3] > 0) (sg[r[2]] = sg[r[2]] || []).push(r);
    else { const k = r[2] + '|' + r[4]; (eg[k] = eg[k] || []).push(r); }
  });
  return { sg, eg };
}
const equipStat = a => { const s = S(a.map(r => r[5])); return [s.length, md(s), qt(s, .25), qt(s, .75), s[s.length - 1], s.reduce((t, x) => t + x, 0)]; };

// Pacote "agora": últimos 7 dias de vendas + anúncios abertos (o formato que o site lê).
export function buildPack(rows, browse, now = Date.now()) {
  const days = [...new Set(rows.map(r => dayOf(r[6]).slice(5)))].sort();
  const G = rows.filter(isGold), [gh, gd, ghn] = series(G, goldVal, days);
  const gold = [...stat4(G.map(goldVal)), G.reduce((t, r) => t + r[5], 0), gh, gd, ghn];
  const { sg, eg } = groupItems(rows), stack = {}, equip = {};
  Object.entries(sg).filter(([, a]) => a.length >= 3)
    .sort((a, b) => b[1].reduce((t, r) => t + r[5], 0) - a[1].reduce((t, r) => t + r[5], 0)).slice(0, 120)
    .forEach(([k, a]) => { const [h, d, hn] = series(a, unitVal, days); stack[k] = [...stat4(a.map(unitVal)), a.reduce((t, r) => t + r[5], 0), a.reduce((t, r) => t + r[3], 0), h, d, hn]; });
  Object.entries(eg).filter(([, a]) => a.length >= 3).forEach(([k, a]) => { equip[k] = equipStat(a); });
  const live = browse.filter(x => x.type === 'item')
    .map(x => [x.id, x.item.name, x.item.qty || 0, x.item.tier || 0, x.item.upLevel || 0, (x.item.attrs || []).length, x.startPrice, x.currentPrice, x.bidCount, x.endsAt])
    .filter(l => { const ref = l[2] ? stack[l[1]] : equip[l[1] + '|' + l[3]]; if (!ref) return false; const fair = l[2] ? ref[1] * l[2] : ref[1]; return l[7] < fair * 0.9; });
  const goldLive = browse.filter(x => x.type === 'gold').map(x => [x.id, x.goldAmount, x.startPrice, x.currentPrice, x.bidCount, x.endsAt])
    .sort((a, b) => a[3] / a[1] - b[3] / b[1]).slice(0, 30);
  const ends = rows.map(r => r[6]);
  const meta = {
    coletado: now, de: Math.min(...ends), ate: Math.max(...ends), vendas: rows.length,
    coins: rows.reduce((t, r) => t + r[5], 0), umLance: rows.filter(r => r[7] === 1).length,
    precoInicial: rows.filter(r => r[5] === r[8]).length, days, ativos: browse.length,
  };
  return { meta, gold, stack, equip, live, goldLive };
}

// Resumo de um mês (o que fica guardado para sempre quando o mês fecha).
export function summarizeMonth(mes, rows, fechado, now = Date.now()) {
  const G = rows.filter(isGold), gd = {};
  G.forEach(r => { const d = dayOf(r[6]).slice(5); (gd[d] = gd[d] || []).push(goldVal(r)); });
  const goldDaily = {}; Object.keys(gd).sort().forEach(d => goldDaily[d] = r3(md(S(gd[d]))));
  const { sg, eg } = groupItems(rows), stack = {}, equip = {};
  Object.entries(sg).forEach(([k, a]) => { if (a.length >= 3) stack[k] = [...stat4(a.map(unitVal)), a.reduce((t, r) => t + r[5], 0), a.reduce((t, r) => t + r[3], 0)]; });
  Object.entries(eg).forEach(([k, a]) => { if (a.length >= 3) equip[k] = equipStat(a); });
  return {
    mes, fechado, atualizado: now,
    dias: [...new Set(rows.map(r => dayOf(r[6])))].sort(),
    vendas: rows.length, coins: rows.reduce((t, r) => t + r[5], 0),
    sum: { gold: G.length ? [...stat4(G.map(goldVal)), G.reduce((t, r) => t + r[5], 0)] : null, goldDaily, stack, equip },
  };
}
