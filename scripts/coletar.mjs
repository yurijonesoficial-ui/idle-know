// Coleta do Idle-Know. Roda sozinho no GitHub Actions a cada 6 horas.
//  - guarda as vendas novas em dados/vendas/AAAA-MM.json (o armazém do mês)
//  - gera public/data/atual.json (últimos 7 dias + anúncios abertos)
//  - gera public/data/meses/AAAA-MM.json (resumo de cada mês) e o índice
//  - "vira o mês": 8 dias depois da virada, o mês anterior fecha — o resumo
//    fica para sempre e as vendas detalhadas daquele mês são apagadas.
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pullHistory, pullBrowse, buildPack, summarizeMonth, monthOf, nextMonthStart, DAY } from './core.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const RAW = join(ROOT, 'dados/vendas');
const OUT = join(ROOT, 'public/data');
const MESES = join(OUT, 'meses');
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
  log('pronto');
}

main().catch(e => { console.error(e); process.exit(1); });
