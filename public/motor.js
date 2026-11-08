// Motor do otimizador do Idle-Know.
//
// Duas fontes:
//  1. Regras exatas, lidas do código do jogo (public/data/jogo.json): fórmulas
//     das magias, itens, atributos, forja, upgrade, monstros e hunts.
//  2. Calibração medida no jogo (CAL, abaixo): o que roda só no servidor e foi
//     medido golpe a golpe com o combat log (docs/medicoes/).
//
// As fórmulas são avaliadas por um avaliador próprio: só números, parâmetros e
// as operações listadas. Nada de eval/new Function.
(function (raiz) {
  'use strict';

  // ---------------------------------------------------------------- calibração
  // Medido em 07–08/11/2026 com uma party MS/EK/ED (~1.300) — ver docs/medicoes.
  const CAL = {
    critBase: 0.5,        // crítico = 1 + 0,5 + Dano crítico (bateu em MS, ED e EK)
    critExtra: 0.28,      // chance real ≈ chance do painel + 28 p.p. (charms, avatar…)
    fatalBonus: 0.6,      // onslaught soma +60% (não multiplica o crítico)
    runa: 1.09,           // runas: dano real ÷ fórmula × bônus
    magia: 1.25,          // magias (média medida; por magia abaixo)
    porMagia: {           // medido: real ÷ (fórmula × bônus)
      'exevo gran mas vis': 1.18, 'exevo gran mas flam': 1.24, 'exevo gran mas mort': 1.21,
      'exevo gran mas tera': 1.33, 'exevo gran mas frigo': 1.44,
    },
    varinha: 0.00462,     // ataque básico de varinha/rod ≈ média × (1+Ataque) × level × 0,00462
    melee: 0.126,         // ataque básico melee ≈ (atk+elemento) × (1+Ataque) × skill × 0,126 (1 medição)
    gcd: 2000,            // magias de ataque e runas dividem o global cooldown de 2 s
    alvosArea: 3,         // monstros atingidos por magia de área (média)
    ataqueBase: 2000,     // intervalo do ataque básico = 2000 / (1 + velocidade)
  };

  const ELEM = ['physical', 'energy', 'earth', 'fire', 'ice', 'holy', 'death'];
  const zeros = () => Object.fromEntries(ELEM.map(e => [e, 0]));
  const vd = (a, b) => a + b - a * b / 100; // proteções se multiplicam (código do jogo)

  // ------------------------------------------------------------ avaliador
  function avaliar(no, args, helpers, vars) {
    if (typeof no === 'number') return no;
    if (!Array.isArray(no)) throw new Error('fórmula inválida');
    const [op, ...r] = no;
    const ev = x => avaliar(x, args, helpers, vars);
    switch (op) {
      case 'p': return args[r[0]] ?? 0;
      case 'v': return vars[r[0]];
      case 'let': { const v2 = Object.assign({}, vars); for (const [i, e] of r[0]) v2[i] = avaliar(e, args, helpers, v2); return avaliar(r[1], args, helpers, v2); }
      case '+': return ev(r[0]) + ev(r[1]);
      case '-': return ev(r[0]) - ev(r[1]);
      case '*': return ev(r[0]) * ev(r[1]);
      case '/': return ev(r[0]) / ev(r[1]);
      case '**': return ev(r[0]) ** ev(r[1]);
      case 'arr': return r.map(ev);
      case 'idx': return ev(r[0])[r[1]];
      case 'max': return Math.max(...r.map(ev));
      case 'min': return Math.min(...r.map(ev));
      case 'floor': return Math.floor(ev(r[0]));
      case 'round': return Math.round(ev(r[0]));
      case 'ceil': return Math.ceil(ev(r[0]));
      case 'sqrt': return Math.sqrt(ev(r[0]));
      case 'pow': return Math.pow(ev(r[0]), ev(r[1]));
      case 'h': { const f = helpers[r[0]]; if (!f) throw new Error('helper ausente: ' + r[0]); return chamar(f, r.slice(1).map(ev), helpers); }
      default: throw new Error('operação desconhecida: ' + op);
    }
  }
  function chamar(fn, args, helpers) { return avaliar(fn.corpo, fn.params.map((d, i) => (args[i] ?? d ?? 0)), helpers, {}); }

  // ------------------------------------------------------------ stats
  function novaFicha() {
    return {
      atkPct: 0, defFlat: 0, armorFlat: 0, critChance: 0, critDmg: 0, lifeLeech: 0, manaLeech: 0,
      hpPct: 0, manaPct: 0, expPct: 0, lootPct: 0, spellDmgPct: 0, attackSpeedPct: 0, spellHealPct: 0,
      onslaught: 0, momentum: 0, ruse: 0, transcendence: 0, amplification: 0, execute: 0, mantra: 0,
      absorbPct: zeros(), elementDmgPct: zeros(),
      skill: { magic: 0, melee: 0, distance: 0, fist: 0, shielding: 0 }, magicEl: zeros(),
    };
  }
  const SKILL = { magic: 'magic', sword: 'melee', axe: 'melee', club: 'melee', melee: 'melee', distance: 'distance', fist: 'fist', shielding: 'shielding' };
  const ATR = { 1: 'atkPct', 2: 'defFlat', 3: 'armorFlat', 4: 'onslaught', 5: 'critChance', 6: 'critDmg', 7: 'lifeLeech', 8: 'manaLeech', 9: 'lootPct', 10: 'expPct', 18: 'attackSpeedPct', 19: 'spellDmgPct', 20: 'spellHealPct', 21: 'hpPct', 22: 'manaPct', 25: 'execute', 26: 'attackSpeedPct' };
  const ATR_PROT = { 12: 'fire', 13: 'earth', 14: 'energy', 15: 'ice', 16: 'holy', 17: 'death' };
  const ATR_DANO = { 27: 'fire', 28: 'earth', 29: 'energy', 30: 'ice', 31: 'holy', 32: 'death' };
  const FORJA = { weapon: ['onslaught', .05, .4, .05], helmet: ['momentum', .05, 1.9, .05], armor: ['ruse', .0307576, .440697, .026], legs: ['transcendence', .0127, .107, .0073], boots: ['amplification', .4, 1.7, .4] };

  // Soma um item equipado {name, tier, upLevel, ftier, attrs:[{id,level}], imbs:[{key,tier}]} na ficha f (sinal 1 ou -1).
  function somarItem(jogo, f, eq, sinal = 1) {
    const it = jogo.equipamentos[eq.name]; if (!it) return f;
    const s = sinal, up = eq.upLevel || 0;
    for (const [k, v] of Object.entries(it.skills || {})) { const sk = SKILL[k]; if (sk && !(k !== 'magic' && it.slot === 'amulet' && sk !== 'magic' && false)) f.skill[sk] += s * v; }
    for (const [e, v] of Object.entries(it.magicEl || {})) if (e in f.magicEl) f.magicEl[e] += s * v;
    for (const k of ['critChance', 'critDmg', 'lifeLeech', 'manaLeech']) if (it[k]) f[k] += s * it[k];
    for (const [e, v] of Object.entries(it.absorb || {})) protecao(f, e, v, s);
    if (it.mantra && ['helmet', 'amulet', 'armor', 'legs', 'ring'].includes(it.slot)) f.mantra += s * it.mantra;
    if (it.slot === 'weapon') f.atkPct += s * up;
    else { if (it.arm) f.armorFlat += s * it.arm * (1 + up * 0.005); }
    if (it.def && it.slot !== 'weapon') f.defFlat += s * it.def;
    const fj = FORJA[it.slot]; const n = eq.ftier || 0;
    if (fj && n > 0) f[fj[0]] += s * (fj[1] * n * n + fj[2] * n + fj[3]);
    for (const a of eq.attrs || []) somarAtributo(jogo, f, a.id, a.level, s);
    for (const im of eq.imbs || []) somarImbuement(jogo, f, im.key, im.tier, s);
    return f;
  }
  function protecao(f, e, v, s) {
    const els = e === 'all' ? ELEM : [e];
    for (const el of els) {
      if (!(el in f.absorbPct)) continue;
      const a = f.absorbPct[el];
      f.absorbPct[el] = s > 0 ? vd(a, v) : (a - v) / (1 - v / 100); // desfaz vd
    }
  }
  function somarAtributo(jogo, f, id, nivel, s = 1) {
    const def = (jogo.atributos || []).find(a => a.id === id); if (!def) return;
    const v = def.bonus * nivel;
    if (ATR[id]) f[ATR[id]] += s * v;
    else if (id === 11) protecao(f, 'all', v, s);
    else if (ATR_PROT[id]) protecao(f, ATR_PROT[id], v, s);
    else if (ATR_DANO[id]) f.elementDmgPct[ATR_DANO[id]] += s * v;
  }
  function somarImbuement(jogo, f, key, tier, s = 1) {
    const im = (jogo.imbuements || []).find(x => x.key === key); if (!im) return;
    const v = im.values[Math.max(0, Math.min(2, (tier || 3) - 1))];
    switch (im.kind) {
      case 'leech-life': f.lifeLeech += s * v; break;
      case 'leech-mana': f.manaLeech += s * v; break;
      case 'crit': f.critDmg += s * v; f.critChance += s * 5; break;
      case 'protect': protecao(f, im.element, v, s); break;
      case 'skill': f.skill[im.skill] = (f.skill[im.skill] || 0) + s * v; break;
      case 'elemdmg': f.convert = f.convert || {}; f.convert[im.element] = (f.convert[im.element] || 0) + s * v; break;
    }
  }
  function fichaDosItens(jogo, equipamento) { const f = novaFicha(); for (const eq of equipamento || []) somarItem(jogo, f, eq, 1); return f; }
  function clonar(f) { return JSON.parse(JSON.stringify(f)); }

  // ---------------------------------------------------------- painel "Bônus"
  // Lê o texto copiado do painel Bônus do jogo (português ou inglês).
  const ROTULOS = [
    [/^(ataque|attack)$/i, 'atkPct'], [/^(defesa|defense)$/i, 'defFlat'], [/^(armadura|armor)$/i, 'armorFlat'],
    [/^(chance de crítico|critical chance|crit chance)$/i, 'critChance'], [/^(dano crítico|critical damage|crit damage)$/i, 'critDmg'],
    [/^life leech$/i, 'lifeLeech'], [/^mana leech$/i, 'manaLeech'], [/^(hp máximo|max hp)$/i, 'hpPct'], [/^(mana máxima|max mana)$/i, 'manaPct'],
    [/^(velocidade de ataque|attack speed)$/i, 'attackSpeedPct'], [/^(dano de magia|spell damage)$/i, 'spellDmgPct'],
    [/^(cura de magia|spell healing)$/i, 'spellHealPct'], [/^(xp|exp)$/i, 'expPct'], [/^loot$/i, 'lootPct'],
    [/^onslaught/i, 'onslaught'], [/^amplification/i, 'amplification'], [/^momentum/i, 'momentum'], [/^(esquiva|ruse)/i, 'ruse'],
  ];
  const EL_PT = { physical: 'physical', energy: 'energy', earth: 'earth', fire: 'fire', ice: 'ice', holy: 'holy', death: 'death' };
  function lerPainel(texto) {
    const linhas = String(texto || '').split(/\r?\n|\|/).map(s => s.trim()).filter(Boolean);
    const f = novaFicha(); const achou = new Set(); const skillsBase = {};
    // No painel os decimais usam ponto (+44.079 = 44,079); vírgula também é aceita.
    const num = s => { const t = String(s).replace('−', '-').trim(); const m = /^([+-]?)\s*([\d.,]+)/.exec(t); if (!m) return null; let x = m[2]; if ((x.match(/\./g) || []).length > 1) x = x.replace(/\./g, ''); x = x.replace(',', '.'); const v = parseFloat(x); return isNaN(v) ? null : (m[1] === '-' ? -v : v); };
    for (let i = 0; i < linhas.length - 1; i++) {
      const rot = linhas[i], val = linhas[i + 1];
      let m;
      if ((m = /^(proteção|protection)\s+(\w+)$/i.exec(rot)) && EL_PT[m[2].toLowerCase()]) { const v = num(val); if (v != null) { f.absorbPct[m[2].toLowerCase()] = v; achou.add('abs'); } continue; }
      if ((m = /^(dano|damage)\s+(\w+)$/i.exec(rot)) && EL_PT[m[2].toLowerCase()]) { const v = num(val); if (v != null) { f.elementDmgPct[m[2].toLowerCase()] = v; achou.add('el'); } continue; }
      if ((m = /^(magic|fist|melee|distance|shielding)$/i.exec(rot)) && (m = /^(\d+)\s*\+\s*(\d+)/.exec(val))) { skillsBase[rot.toLowerCase()] = +m[1]; f.skill[rot.toLowerCase()] = +m[2]; achou.add('skill'); continue; }
      for (const [re, k] of ROTULOS) if (re.test(rot)) { const v = num(val); if (v != null && !achou.has(k)) { f[k] = v; achou.add(k); } break; }
    }
    return { ficha: f, skillsBase, campos: achou.size };
  }

  // ---------------------------------------------------------- combate
  const EL_MAGIA = [[/\bvis\b|lux/, 'energy'], [/flam/, 'fire'], [/mort|obscuro/, 'death'], [/tera|pox|naturo/, 'earth'], [/frigo/, 'ice'], [/\bsan\b|sanct/, 'holy']];
  function elementoMagia(m, arma) {
    const w = m.words || '';
    for (const [re, el] of EL_MAGIA) if (re.test(w)) return [[el, 1]];
    // magias de arma (knight/monk/paladin): dividem entre físico e o elemento da arma
    if (arma && arma.elementType && arma.elementAtk) { const tot = (arma.atk || 0) + arma.elementAtk; return [['physical', (arma.atk || 0) / tot], [arma.elementType, arma.elementAtk / tot]]; }
    return [['physical', 1]];
  }
  const ehRuna = m => /^adori/.test(m.words || '');

  // personagem: {vocacao, level, skills:{magic,...} (base), equipamento:[...], ficha (total, opcional)}
  // devolve a ficha total usada no combate
  function fichaTotal(jogo, p) {
    if (p.ficha) return p.ficha;
    const f = fichaDosItens(jogo, p.equipamento);
    return f;
  }
  function arma(jogo, p) { const w = (p.equipamento || []).find(e => (jogo.equipamentos[e.name] || {}).slot === 'weapon'); return w ? jogo.equipamentos[w.name] : null; }

  // Dano esperado de um golpe de magia em um monstro (média, já com crítico e fatal)
  function danoMagia(jogo, p, f, m, monstro) {
    const fn = m.dmg && m.dmg.$fn; if (!fn) return 0;
    const w = arma(jogo, p) || {};
    const skillArma = (p.skills[w.wt === 'distance' || w.ammoType ? 'distance' : (p.vocacao === 'monk' ? 'fist' : 'melee')] || 0) + (f.skill[w.wt === 'distance' ? 'distance' : (p.vocacao === 'monk' ? 'fist' : 'melee')] || 0);
    const atkArma = (w.atk || 0) + (w.elementAtk || 0);
    const partes = elementoMagia(m, w);
    let total = 0;
    for (const [el, frac] of partes) {
      const ml = (p.skills.magic || 0) + (f.skill.magic || 0) + (f.magicEl[el] || 0);
      const [a, b] = chamar(fn, [p.level, ml, skillArma, atkArma, w.def || 0, w.arm || 0], jogo.helpers || {});
      const media = (a + b) / 2 * frac;
      const res = ((monstro && monstro.resist && monstro.resist[el]) || 0) / 100;
      let mult = (1 + f.spellDmgPct / 100) * (1 + (f.elementDmgPct[el] || 0) / 100) * (1 - res);
      mult *= ehRuna(m) ? CAL.runa : (CAL.porMagia[m.words] || CAL.magia);
      total += media * mult;
    }
    return total * multCritFatal(f, m, jogo, p);
  }
  function multCritFatal(f, m, jogo, p) {
    let cc = f.critChance, cd = f.critDmg;
    if (m) for (const eq of p.equipamento || []) for (const a of (jogo.equipamentos[eq.name] || {}).augments || []) if (a.spell === (m.name || '').toLowerCase()) { if (a.kind === 'critDmg') cd += a.value; if (a.kind === 'critChance') cc += a.value; }
    const pc = Math.min(1, Math.max(0, cc / 100 + CAL.critExtra));
    const pf = Math.min(1, f.onslaught / 100 * (1 + f.amplification / 100));
    return 1 + pc * (CAL.critBase + cd / 100) + pf * CAL.fatalBonus;
  }
  function danoBasico(jogo, p, f, monstro) {
    const w = arma(jogo, p); if (!w) return 0;
    let base, el;
    if (w.wandMin) { base = (w.wandMin + w.wandMax) / 2 * (1 + f.atkPct / 100) * p.level * CAL.varinha; el = w.elementType || 'physical'; }
    else {
      const sk = (p.skills.melee || 0) + (f.skill.melee || 0);
      base = ((w.atk || 0) + (w.elementAtk || 0)) * (1 + f.atkPct / 100) * sk * CAL.melee; el = w.elementType || 'physical';
    }
    const res = ((monstro && monstro.resist && monstro.resist[el]) || 0) / 100;
    return base * (1 + (f.elementDmgPct[el] || 0) / 100) * (1 - res) * multCritFatal(f, null, jogo, p);
  }

  // Média dos monstros de uma hunt (para resistências e vida)
  function monstrosDaHunt(jogo, huntId) {
    const h = (jogo.hunts || []).find(x => x.id === huntId); if (!h) return [];
    return h.monsters.map(k => jogo.monstros[k]).filter(Boolean);
  }

  // DPS do personagem numa hunt: rotação gulosa (a cada 2 s, a magia/runa disponível de maior dano)
  function dps(jogo, p, f, huntId, opts = {}) {
    const mons = monstrosDaHunt(jogo, huntId); const alvoMedio = mons.length ? mons : [null];
    const alvos = Math.max(1, Math.min(opts.alvos ?? CAL.alvosArea, (jogo.hunts.find(x => x.id === huntId) || {}).maxAlive || 4));
    const media = fn => alvoMedio.reduce((s, m) => s + fn(m), 0) / alvoMedio.length;
    const magias = (jogo.magias || []).filter(m => m.dmg && (m.vocs || []).includes(p.vocacao) && (m.level || 0) <= p.level && (!m.spec || m.spec === p.especializacao) && !m.promo && (opts.semRunas ? !ehRuna(m) : true) && (!opts.magias || opts.magias.has(m.words)));
    const lista = magias.map(m => {
      const porAlvo = media(mon => danoMagia(jogo, p, f, m, mon));
      const n = m.type === 'area' ? alvos : (m.chain ? Math.min(m.chain.targets || 1, alvos) : 1);
      return { m, porAlvo, porCast: porAlvo * n, cd: m.cd || CAL.gcd, n };
    }).sort((a, b) => b.porCast - a.porCast);
    // simulação de 120 s
    const T = 120000, livre = new Map(); let t = 0; const usos = new Map();
    const momentum = Math.min(1, (f.momentum || 0) / 100);
    while (t < T) {
      const op = lista.find(x => (livre.get(x.m.words) || 0) <= t);
      if (op) { usos.set(op.m.words, (usos.get(op.m.words) || 0) + 1); livre.set(op.m.words, t + op.cd * (1 - momentum * 0.2)); }
      t += CAL.gcd;
    }
    const porMagia = lista.filter(x => usos.get(x.m.words)).map(x => ({ nome: x.m.name, words: x.m.words, usos: usos.get(x.m.words), dano: x.porCast * usos.get(x.m.words) / (T / 1000), porAlvo: x.porAlvo, alvos: x.n }));
    const intervalo = CAL.ataqueBase / (1 + f.attackSpeedPct / 100);
    const basico = media(mon => danoBasico(jogo, p, f, mon)) * 1000 / intervalo;
    if (basico > 0) porMagia.push({ nome: 'Ataque básico', words: '', usos: Math.round(T / intervalo), dano: basico, porAlvo: basico * intervalo / 1000, alvos: 1 });
    const total = porMagia.reduce((s, x) => s + x.dano, 0);
    return { total, porMagia: porMagia.sort((a, b) => b.dano - a.dano) };
  }

  // Dano recebido por segundo na hunt (média por monstro atacando), depois das proteções
  function danoRecebido(jogo, f, huntId) {
    const mons = monstrosDaHunt(jogo, huntId); if (!mons.length) return { total: 0, porElemento: zeros() };
    const pe = zeros();
    for (const m of mons) {
      if (m.dmg) pe.physical += (m.dmg[0] + m.dmg[1]) / 2 / 2;
      for (const a of m.abilities || []) if (a.element !== 'healing' && a.element in pe) pe[a.element] += (a.min + a.max) / 2 * (a.chance / 100) / ((a.interval || 2000) / 1000);
    }
    let total = 0; const depois = zeros();
    for (const e of ELEM) { depois[e] = pe[e] / mons.length * (1 - Math.min(100, f.absorbPct[e] || 0) / 100); total += depois[e]; }
    return { total, porElemento: depois };
  }

  function vidaMaxima(jogo, p, f) {
    const v = (jogo.vocacoes || {})[p.vocacao] || { hpPerLevel: 5 };
    return (185 + p.level * v.hpPerLevel) * (1 + f.hpPct / 100);
  }

  function xpPorHora(jogo, p, f, huntId, dpsTotal, dpsParty = 0) {
    const h = (jogo.hunts || []).find(x => x.id === huntId); const mons = monstrosDaHunt(jogo, huntId);
    if (!h || !mons.length) return 0;
    const hp = mons.reduce((s, m) => s + m.hp, 0) / mons.length, xp = mons.reduce((s, m) => s + m.exp, 0) / mons.length;
    const limite = 1000 / (h.spawnMs || 2200);
    const kps = Math.min(limite, (dpsTotal + dpsParty) / hp);
    return kps * 3600 * xp * (1 + f.expPct / 100);
  }

  // -------------------------------------------------------------- objetivo
  const MODOS = {
    dano: { nome: 'Dano', valor: r => r.dps },
    xp: { nome: 'XP', valor: r => r.xp },
    defesa: { nome: 'Defesa', valor: r => -r.recebido },
    hp: { nome: 'HP', valor: r => r.hp },
    loot: { nome: 'Loot', valor: r => r.kps * (1 + r.f.lootPct / 100) },
  };
  function avaliarBuild(jogo, p, f, huntId, opts = {}) {
    const d = dps(jogo, p, f, huntId, opts);
    const rec = danoRecebido(jogo, f, huntId);
    const h = (jogo.hunts || []).find(x => x.id === huntId) || {}; const mons = monstrosDaHunt(jogo, huntId);
    const hpM = mons.length ? mons.reduce((s, m) => s + m.hp, 0) / mons.length : 1;
    const kps = Math.min(1000 / (h.spawnMs || 2200), (d.total + (opts.dpsParty || 0)) / hpM);
    return { f, dps: d.total, porMagia: d.porMagia, recebido: rec.total, recebidoEl: rec.porElemento, hp: vidaMaxima(jogo, p, f), xp: xpPorHora(jogo, p, f, huntId, d.total, opts.dpsParty || 0), kps };
  }

  // Ficha alterada trocando o item de um slot (mantém raridade, upgrade, forja e atributos do item atual)
  function trocarBase(jogo, fBase, eqAtual, novoNome) {
    const f = clonar(fBase);
    if (eqAtual) somarItem(jogo, f, eqAtual, -1);
    const novo = Object.assign({}, eqAtual || { tier: 0, upLevel: 0, ftier: 0, attrs: [] }, { name: novoNome });
    somarItem(jogo, f, novo, 1);
    return { f, novo };
  }
  function usavel(it, p) { return (!it.vocs || it.vocs.includes(p.vocacao)) && (it.level || 0) <= p.level && !it.charges && !it.durationSec; }

  // Melhor base por slot (troca uma peça por vez) e busca coordenada para a build completa
  function otimizar(jogo, p, huntId, modo = 'dano', opts = {}) {
    const val = MODOS[modo].valor;
    const f0 = fichaTotal(jogo, p);
    const r0 = avaliarBuild(jogo, p, f0, huntId, opts);
    const slots = [...new Set(Object.values(jogo.equipamentos).map(i => i.slot))].filter(s => s !== 'backpack' && s !== 'ammo');
    const atual = Object.fromEntries((p.equipamento || []).map(e => [(jogo.equipamentos[e.name] || {}).slot || e.slot, e]));
    const preco = opts.preco || (() => null);
    const sugestoes = {};
    for (const s of slots) {
      const cand = Object.entries(jogo.equipamentos).filter(([n, it]) => it.slot === s && usavel(it, p));
      if (s === 'weapon' && atual.weapon) { const wt = (jogo.equipamentos[atual.weapon.name] || {}).wt; if (wt) cand.splice(0, cand.length, ...cand.filter(([, it]) => (it.wt === 'wand' || it.wt === 'rod') === (wt === 'wand' || wt === 'rod'))); }
      const lin = [];
      for (const [nome] of cand) {
        if (atual[s] && nome === atual[s].name) continue;
        const { f, novo } = trocarBase(jogo, f0, atual[s], nome);
        if (opts.orcamento && preco(nome, novo.tier) > opts.orcamento) continue;
        const r = avaliarBuild(jogo, p, f, huntId, opts);
        lin.push({ nome, ganho: (val(r) - val(r0)) / Math.abs(val(r0) || 1), preco: preco(nome, novo.tier), r });
      }
      sugestoes[s] = lin.sort((a, b) => b.ganho - a.ganho).slice(0, 5);
    }
    // atributos: quanto vale +1 nível de cada atributo
    const atributos = (jogo.atributos || []).map(a => {
      const f = clonar(f0); somarAtributo(jogo, f, a.id, 1, 1);
      const r = avaliarBuild(jogo, p, f, huntId, opts);
      return { id: a.id, nome: a.name, porNivel: a.bonus, percent: a.percent, ganho: (val(r) - val(r0)) / Math.abs(val(r0) || 1) };
    }).sort((a, b) => b.ganho - a.ganho);
    // imbuements no nível 3
    const imbuements = (jogo.imbuements || []).map(im => {
      const f = clonar(f0); somarImbuement(jogo, f, im.key, 3, 1);
      const r = avaliarBuild(jogo, p, f, huntId, opts);
      return { key: im.key, nome: im.name, cat: im.cat, ganho: (val(r) - val(r0)) / Math.abs(val(r0) || 1) };
    }).sort((a, b) => b.ganho - a.ganho);
    return { atual: r0, sugestoes, atributos, imbuements };
  }

  function magiasDisponiveis(jogo, p) { return (jogo.magias || []).filter(m => m.dmg && (m.vocs || []).includes(p.vocacao) && (m.level || 0) <= p.level && (!m.spec || m.spec === p.especializacao) && !m.promo); }

  const api = { magiasDisponiveis, CAL, avaliar, chamar, novaFicha, somarItem, somarAtributo, somarImbuement, fichaDosItens, lerPainel, elementoMagia, danoMagia, danoBasico, dps, danoRecebido, vidaMaxima, xpPorHora, avaliarBuild, otimizar, monstrosDaHunt, MODOS, trocarBase };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.IdleKnowMotor = api;
})(this);
