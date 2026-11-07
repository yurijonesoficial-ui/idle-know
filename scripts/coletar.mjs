// Coleta do Idle-Know. Roda sozinho no GitHub Actions a cada 6 horas.
//  - guarda as vendas novas em dados/vendas/AAAA-MM.json (o armazém do mês)
//  - gera public/data/atual.json (últimos 7 dias + anúncios abertos)
//  - gera public/data/meses/AAAA-MM.json (resumo de cada mês) e o índice
//  - "vira o mês": 8 dias depois da virada, o mês anterior fecha — o resumo
//    fica para sempre e as vendas detalhadas daquele mês são apagadas.
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pullHistory, pullBrowse, buildPack, summarizeMonth, monthOf, nextMonthStart, DAY, API } from './core.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const RAW = join(ROOT, 'dados/vendas');
const OUT = join(ROOT, 'public/data');
const MESES = join(OUT, 'meses');
const IMG = join(ROOT, 'public/img');
const THINGS = new URL('../things/', API).href; // https://baiakidle.com/api/things/
const headers = { 'user-agent': 'IdleKnow/1.0 (site de estatisticas do market; coleta 4x por dia)' };
const log = (...a) => console.log('[idle-know]', ...a);
const readJson = async (p, def) => existsSync(p) ? JSON.parse(await readFile(p, 'utf8')) : def;
const writeJson = (p, o) => writeFile(p, JSON.stringify(o));

async function main() {
  await mkdir(RAW, { recursive: true }); await mkdir(MESES, { recursive: true });
  const now = Date.now();

  // 1. carrega o armazém (vendas dos meses ainda abertos)
  const byMonth = {};
  for (const f of (await readdir(RAW)).filter(f => f.endsWith('.json'))) byMonth[f.slice(0, 7)] = (await readJson(join(RAW, f))).rows;
  const known = new Set(Object.values(byMonth).flat().map(r => r[0]));
  const indice = await readJson(join(MESES, 'index.json'), []);
  const fechados = new Set(indice.filter(m => m.fechado).map(m => m.mes));
  log(`armazém: ${known.size} vendas em ${Object.keys(byMonth).length} mês(es)`);

  // 2. vendas novas
  const novas = await pullHistory(known, { headers, log });
  let ignoradas = 0;
  for (const r of novas) {
    const m = monthOf(r[6]);
    if (fechados.has(m)) { ignoradas++; continue; }
    (byMonth[m] = byMonth[m] || []).push(r);
  }
  log(`vendas novas: ${novas.length}${ignoradas ? ` (${ignoradas} de mês já fechado, ignoradas)` : ''}`);

  // 3. anúncios abertos + pacote "agora"
  const browse = await pullBrowse({ headers, log });
  const todas = Object.values(byMonth).flat();
  const maxEnd = Math.max(...todas.map(r => r[6]));
  const ultimos7 = todas.filter(r => r[6] > maxEnd - 7 * DAY);
  await writeJson(join(OUT, 'atual.json'), buildPack(ultimos7, browse, now));

  // 4. meses: resume os abertos e fecha os antigos
  const idx = new Map(indice.map(m => [m.mes, m]));
  const mesAtual = monthOf(now);
  for (const [m, rows] of Object.entries(byMonth).sort()) {
    const fechar = m < mesAtual && now >= nextMonthStart(m) + 8 * DAY;
    const resumo = summarizeMonth(m, rows, fechar, now);
    await writeJson(join(MESES, `${m}.json`), resumo);
    idx.set(m, { mes: m, dias: resumo.dias.length, vendas: resumo.vendas, fechado: fechar });
    if (fechar) { await rm(join(RAW, `${m}.json`), { force: true }); log(`${m}: mês FECHADO`); }
    else { rows.sort((a, b) => a[6] - b[6]); await writeJson(join(RAW, `${m}.json`), { mes: m, rows }); log(`${m}: ${rows.length} vendas`); }
  }
  await writeJson(join(MESES, 'index.json'), [...idx.values()].sort((a, b) => b.mes.localeCompare(a.mes)));
  const nomes = new Set([...todas.filter(r => r[1] === 'i').map(r => r[2]), ...browse.filter(x => x.item).map(x => x.item.name)]);
  await imagens(nomes);
  await dadosDoJogo();
  log('pronto');
}

// Imagens dos itens. Duas fontes públicas do jogo:
//  1. o catálogo /api/things/manifest.json (nome -> sprite), com ~1.600 itens;
//  2. a tabela de itens dentro do código do jogo (/jogar/assets/game-*.js),
//     com ~9.700 nomes no formato "nome":{id:N} ou nome:{id:N}.
// Baixamos o sprite de cada item que aparece no market UMA vez e guardamos em
// public/img/. O site usa o servidor do jogo como reserva para o resto.
let codigoJogo = null; // reaproveitado pela extração de regras (dadosDoJogo)
async function tabelaDoJogo() {
  const base = new URL('../../jogar/', API).href; // https://baiakidle.com/jogar/
  const html = await (await fetch(base, { headers })).text();
  let game = (html.match(/assets\/game-[\w-]+\.js/) || [])[0];
  if (!game) {
    const main = (html.match(/assets\/main-[\w-]+\.js/) || [])[0];
    if (main) { const mt = await (await fetch(base + main, { headers })).text(); const g = (mt.match(/game-[\w-]+\.js/) || [])[0]; if (g) game = 'assets/' + g; }
  }
  if (!game) throw new Error('não achei o game-*.js');
  const t = await (await fetch(base + game, { headers })).text();
  codigoJogo = { arquivo: game, texto: t };
  const re = /(?:"([^"\\]+)"|([A-Za-z_$][\w$]*)):\{id:(\d+)[,}]/g, mapa = {};
  let m; while ((m = re.exec(t))) { const n = m[1] || m[2]; if (!(n in mapa)) mapa[n] = +m[3]; }
  return mapa;
}

async function imagens(nomes) {
  try {
    await mkdir(IMG, { recursive: true });
    const ids = {};
    try { Object.assign(ids, await tabelaDoJogo()); } catch (e) { log('imagens: tabela do jogo indisponível —', e.message); }
    try {
      const man = await (await fetch(THINGS + 'manifest.json', { headers })).json();
      for (const [nome, file] of Object.entries(man.items || {})) { const m = /^object\/(\d+)\.png/.exec(file); if (m) ids[nome] = +m[1]; }
    } catch (e) { log('imagens: catálogo indisponível —', e.message); }
    if (!Object.keys(ids).length) throw new Error('nenhuma fonte de imagens respondeu');
    const ja = new Set((await readdir(IMG)).filter(f => f.endsWith('.png')).map(f => +f.slice(0, -4)));
    const faltam = [...new Set([...nomes].map(n => ids[n]).filter(Boolean))].filter(id => !ja.has(id));
    let baixadas = 0;
    for (const id of faltam.slice(0, 2500)) {
      const ri = await fetch(`${THINGS}object/${id}.png`, { headers });
      if (ri.ok) { await writeFile(join(IMG, `${id}.png`), Buffer.from(await ri.arrayBuffer())); baixadas++; ja.add(id); }
      await new Promise(res => setTimeout(res, 120));
    }
    await writeJson(join(OUT, 'itens.json'), ids);
    const semImg = [...nomes].filter(n => !ids[n]);
    log(`imagens: ${Object.keys(ids).length} nomes conhecidos, ${ja.size} sprites guardados (${baixadas} novos)${semImg.length ? `; sem imagem no jogo: ${semImg.slice(0, 8).join(', ')}` : ''}`);
  } catch (e) { log('imagens: não consegui atualizar agora —', e.message); }
}

// Regras do jogo para o otimizador: itens, monstros, hunts, magias, vocações…
// Lidas do código do jogo sem executá-lo (scripts/jogo.mjs). Só regrava o
// arquivo quando o build do jogo muda.
async function dadosDoJogo() {
  try {
    if (!codigoJogo) await tabelaDoJogo();
    const destino = join(OUT, 'jogo.json');
    const antes = await readJson(destino, null);
    if (antes && antes.build === codigoJogo.arquivo) { log('regras do jogo: build igual, nada a fazer'); return; }
    const { extrair } = await import('./jogo.mjs');
    const dados = { build: codigoJogo.arquivo, ...extrair(codigoJogo.texto) };
    if (dados.avisos.length) log('regras do jogo: avisos —', dados.avisos.join(' | '));
    if (!dados.magias || !dados.equipamentos || !Object.keys(dados.equipamentos).length) throw new Error('extração incompleta, mantendo o arquivo anterior');
    await writeJson(destino, dados);
    log(`regras do jogo: ${Object.keys(dados.equipamentos).length} equipamentos, ${Object.keys(dados.monstros).length} monstros, ${dados.hunts.length} hunts, ${dados.magias.length} magias`);
  } catch (e) { log('regras do jogo: não consegui atualizar agora —', e.message); }
}

main().catch(e => { console.error(e); process.exit(1); });
