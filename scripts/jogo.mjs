// Extrai as tabelas e fórmulas do código do jogo (/jogar/assets/game-*.js)
// SEM executar nada: o arquivo é lido com o parser acorn e só nós literais
// (números, textos, objetos, listas) viram dados. As fórmulas das magias
// (arrow functions) viram uma árvore de expressão simples, que o site avalia
// com o próprio avaliador (public/motor.js), nunca com eval/new Function.
import * as acorn from 'acorn';

// Âncoras: um trecho único que aparece logo no começo de cada tabela.
// Os nomes das variáveis mudam a cada build do jogo; as âncoras, não.
const ANCORAS = {
  itens: '{"200 theons":{',
  itensBase: '{"gold coin":{',
  monstrosCombate: '{"ashscale ravager":{',
  monstros: '{troll:{name:"Troll"',
  hunts: '[{id:"troll-cave"',
  atributos: '[{id:1,key:"weapon_attack"',
  imbuements: '[{key:"vampirism"',
  vocacoes: '{knight:{name:"Knight",outfit:',
  magias: '[{words:"exura",',
  especializacoes: null, // achado por busca (ver abaixo)
  nightmare: '{points:',
};

class NaoLiteral extends Error {}

// Converte um nó do AST em valor JS, aceitando só literais.
function valor(n, ctx) {
  switch (n.type) {
    case 'Literal': return n.value;
    case 'TemplateLiteral': if (n.expressions.length) throw new NaoLiteral('template'); return n.quasis[0].value.cooked;
    case 'UnaryExpression':
      if (n.operator === '-') return -valor(n.argument, ctx);
      if (n.operator === '+') return +valor(n.argument, ctx);
      if (n.operator === '!') return !valor(n.argument, ctx); // !0 / !1
      throw new NaoLiteral(n.operator);
    case 'ArrayExpression': return n.elements.map(e => (e ? valor(e, ctx) : null));
    case 'ObjectExpression': {
      const o = {};
      for (const p of n.properties) {
        if (p.type === 'SpreadElement') { const s = valor(p.argument, ctx); if (s && typeof s === 'object') Object.assign(o, s); continue; }
        const k = p.computed ? valor(p.key, ctx) : (p.key.type === 'Identifier' ? p.key.name : p.key.value);
        try { o[k] = valor(p.value, ctx); }
        catch (e) { if (!(e instanceof NaoLiteral)) throw e; o[k] = { $nao: e.message }; }
      }
      return o;
    }
    case 'ArrowFunctionExpression': case 'FunctionExpression':
      return { $fn: funcao(n, ctx) };
    case 'CallExpression':
      // helpers conhecidos que só montam objetos: Mr(x) = mesmo valor nos 7 elementos
      if (n.callee.type === 'Identifier' && ctx.mr && n.callee.name === ctx.mr) {
        const v = valor(n.arguments[0], ctx); return Object.fromEntries(['physical', 'energy', 'earth', 'fire', 'ice', 'holy', 'death'].map(k => [k, v]));
      }
      throw new NaoLiteral('call ' + (n.callee.name || n.callee.type));
    case 'Identifier':
      if (ctx.consts && n.name in ctx.consts) return ctx.consts[n.name];
      throw new NaoLiteral('id ' + n.name);
    default: throw new NaoLiteral(n.type);
  }
}

// ---- fórmulas: arrow function -> árvore de expressão segura ----------------
// Formato: número | ["p",i] parâmetro i | ["idx",x,i] x[i] | ["+",a,b] ... | ["arr",a,b] | ["max",..] | ["min",..]
//          ["h","nome",args...] helper do jogo (definido em helpers) | ["let",[[i,expr]..],corpo]
const BIN = new Set(['+', '-', '*', '/', '**']);
function funcao(fn, ctx) {
  const params = fn.params.map(p => (p.type === 'AssignmentPattern' ? { nome: p.left.name, padrao: valor(p.right, ctx) } : { nome: p.name }));
  const escopo = new Map(params.map((p, i) => [p.nome, ['p', i]]));
  let corpo;
  if (fn.body.type === 'BlockStatement') {
    const binds = [];
    for (const st of fn.body.body) {
      if (st.type === 'VariableDeclaration') {
        for (const d of st.declarations) { const e = expr(d.init, escopo, ctx); const idx = 100 + binds.length; binds.push([idx, e]); escopo.set(d.id.name, ['v', idx]); }
      } else if (st.type === 'ReturnStatement') { corpo = expr(st.argument, escopo, ctx); }
      else throw new NaoLiteral('stmt ' + st.type);
    }
    if (binds.length) corpo = ['let', binds, corpo];
  } else corpo = expr(fn.body, escopo, ctx);
  return { params: params.map(p => p.padrao ?? null), corpo };
}
function expr(n, escopo, ctx) {
  switch (n.type) {
    case 'Literal': if (typeof n.value !== 'number') throw new NaoLiteral('lit'); return n.value;
    case 'Identifier': if (escopo.has(n.name)) return escopo.get(n.name); if (ctx.consts && typeof ctx.consts[n.name] === 'number') return ctx.consts[n.name]; throw new NaoLiteral('id ' + n.name);
    case 'UnaryExpression': if (n.operator === '-') return ['-', 0, expr(n.argument, escopo, ctx)]; if (n.operator === '+') return expr(n.argument, escopo, ctx); throw new NaoLiteral(n.operator);
    case 'BinaryExpression': if (!BIN.has(n.operator)) throw new NaoLiteral(n.operator); return [n.operator, expr(n.left, escopo, ctx), expr(n.right, escopo, ctx)];
    case 'ArrayExpression': return ['arr', ...n.elements.map(e => expr(e, escopo, ctx))];
    case 'MemberExpression':
      if (n.computed && n.property.type === 'Literal' && typeof n.property.value === 'number') return ['idx', expr(n.object, escopo, ctx), n.property.value];
      throw new NaoLiteral('member');
    case 'CallExpression': {
      const c = n.callee;
      if (c.type === 'MemberExpression' && c.object.name === 'Math' && ['max', 'min', 'floor', 'round', 'ceil', 'sqrt', 'pow'].includes(c.property.name)) return [c.property.name, ...n.arguments.map(a => expr(a, escopo, ctx))];
      if (c.type === 'Identifier' && ctx.helpers && c.name in ctx.helpers) return ['h', ctx.helpers[c.name], ...n.arguments.map(a => expr(a, escopo, ctx))];
      throw new NaoLiteral('call ' + (c.name || c.type));
    }
    default: throw new NaoLiteral(n.type);
  }
}

// ---- utilidades de localização ---------------------------------------------
function parseEm(t, inicio) {
  const n = acorn.parseExpressionAt(t, inicio, { ecmaVersion: 'latest' });
  return n.type === 'SequenceExpression' ? n.expressions[0] : n; // "a={..},b=…" -> só o primeiro
}
function achar(t, ancora) {
  const i = t.indexOf(ancora);
  if (i < 0) throw new Error('âncora não encontrada: ' + ancora);
  if (t.indexOf(ancora, i + 1) >= 0 && !ancora.startsWith('{points')) {/* aceita a primeira */}
  return i;
}
// nome da variável que recebe o literal que começa em i (…,NOME=<literal>)
function nomeAntes(t, i) { const m = /([A-Za-z_$][\w$]*)\s*=\s*$/.exec(t.slice(Math.max(0, i - 60), i)); return m ? m[1] : null; }
// acha a definição "NOME=(a,b,c)=>..." ou "function NOME(" e devolve o nó
function definicao(t, nome) {
  let m = new RegExp('[,;{}\\s]' + nome.replace(/\$/g, '\\$') + '=\\(').exec(t);
  if (m) return parseEm(t, m.index + 1 + nome.length + 1);
  m = new RegExp('function ' + nome.replace(/\$/g, '\\$') + '\\(').exec(t);
  if (m) { const p = acorn.parse(t.slice(m.index, m.index + 4000).replace(/^function [\w$]+/, 'x=function'), { ecmaVersion: 'latest' }); return p.body[0].expression.right; }
  return null;
}

export const VERSAO = 2; // suba quando a extração mudar, para regerar o jogo.json

export function extrair(t) {
  const out = { versao: VERSAO, geradoEm: new Date().toISOString(), avisos: [] };
  const ctx = {};
  // helper Mr(x) -> {7 elementos: x} (usado nas árvores de talento)
  const mr = /(?:const |let |var |,)([A-Za-z_$][\w$]*)=e=>\(\{physical:e,energy:e,earth:e,fire:e,ice:e,holy:e,death:e\}\)/.exec(t);
  if (mr) ctx.mr = mr[1];

  const tabela = (chave, ancora) => {
    try { const i = achar(t, ancora); return { nome: nomeAntes(t, i), dado: valor(parseEm(t, i), ctx) }; }
    catch (e) { out.avisos.push(`${chave}: ${e.message}`); return { nome: null, dado: null }; }
  };

  // itens: só os equipáveis (com slot) e campos que importam ao otimizador
  const itens = tabela('itens', ANCORAS.itens).dado || {};
  out.equipamentos = Object.fromEntries(Object.entries(itens).filter(([, v]) => v && v.slot));
  const mc = tabela('monstrosCombate', ANCORAS.monstrosCombate).dado || {};
  const mh = tabela('monstros', ANCORAS.monstros).dado || {};
  out.monstros = Object.fromEntries(Object.entries(mh).map(([k, v]) => [k, { ...v, ...(mc[String(v.name).toLowerCase()] || {}) }]));
  out.hunts = tabela('hunts', ANCORAS.hunts).dado;
  out.atributos = tabela('atributos', ANCORAS.atributos).dado;
  out.imbuements = tabela('imbuements', ANCORAS.imbuements).dado;
  out.vocacoes = tabela('vocacoes', ANCORAS.vocacoes).dado;

  // especializações: objeto que contém necromancer:{key:"necromancer"
  try {
    const j = t.indexOf('necromancer:{key:"necromancer"');
    let i = t.lastIndexOf('={', j) + 1; // começo do objeto
    out.especializacoes = valor(parseEm(t, i), ctx);
  } catch (e) { out.avisos.push('especializacoes: ' + e.message); }

  // árvores de talento (Rift Tree por vocação): objetos {voc:"x",nodes:[...]}
  out.arvores = {};
  for (const m of t.matchAll(/=\{voc:"(\w+)",nodes:\[/g)) {
    try { const v = valor(parseEm(t, m.index + 1), ctx); out.arvores[v.voc] = v.nodes; } catch (e) { out.avisos.push('arvore ' + m[1] + ': ' + e.message); }
  }

  // magias: helpers usados nas fórmulas (zae, Ab…) viram fórmulas também
  try {
    const i = achar(t, ANCORAS.magias);
    const ast = parseEm(t, i);
    const usados = new Set();
    for (const el of ast.elements) for (const p of el.properties) if (p.value.type === 'ArrowFunctionExpression') {
      const s = t.slice(p.value.start, p.value.end); for (const m of s.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\(/g)) usados.add(m[1]);
    }
    usados.delete('Math');
    ctx.helpers = {}; const helpers = {};
    for (const h of usados) ctx.helpers[h] = h; // nome curto do build; trocado por um nome estável abaixo
    for (const h of usados) { try { const d = definicao(t, h); if (!d) { out.avisos.push('helper não achado: ' + h); continue; } helpers[h] = funcao(d, ctx); } catch (e) { out.avisos.push(`helper ${h}: ${e.message}`); } }
    out.magias = ast.elements.map(el => valor(el, ctx));
    // nomes estáveis para os helpers (independem do build): pelo formato da fórmula
    out.helpers = helpers;
  } catch (e) { out.avisos.push('magias: ' + e.message); }

  // Nightmare/Hell: objeto de config que tem points: … (procurado perto de "dealtFloor")
  try {
    const k = t.indexOf('dealtFloor:');
    const nae = /,([A-Za-z_$][\w$]*)=\(e,t,a,n,o,r\)=>\(\{hp:e,bossHp:t/.exec(t);
    out.nightmareBase = nae ? funcaoObjeto(t, nae.index + 1 + nae[1].length + 1) : null;
    if (k < 0) out.avisos.push('nightmare: dealtFloor não achado');
  } catch (e) { out.avisos.push('nightmare: ' + e.message); }
  return out;
}

// Nae=(e,t,a,n,o,r)=>({hp:e,...}) -> devolve o objeto com os parâmetros nomeados
function funcaoObjeto(t, i) {
  const fn = parseEm(t, i);
  const nomes = fn.params.map(p => p.name);
  const o = {};
  for (const p of fn.body.properties) {
    const k = p.key.name || p.key.value;
    if (p.value.type === 'Identifier' && nomes.includes(p.value.name)) o[k] = '$' + nomes.indexOf(p.value.name);
    else { try { o[k] = valor(p.value, {}); } catch { o[k] = null; } }
  }
  return o;
}
