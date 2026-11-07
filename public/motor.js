// Motor do otimizador do Idle-Know.
// Avalia as fórmulas extraídas do jogo (public/data/jogo.json) com um
// avaliador próprio: só números, parâmetros e as operações abaixo. Nada de
// eval/new Function, então um arquivo de dados alterado não roda código.
(function (raiz) {
  'use strict';

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

  function chamar(fn, args, helpers) {
    const a = fn.params.map((padrao, i) => (args[i] ?? padrao ?? 0));
    return avaliar(fn.corpo, a, helpers, {});
  }

  // Dano base [mín, máx] de uma magia, antes de bônus, crítico e resistência.
  // level, ml = magic level total, skill = skill da arma, atk = ataque da arma
  function danoBaseMagia(jogo, magia, { level, ml, skill = 0, atk = 0, def = 0, arm = 0 }) {
    const f = magia.dmg && magia.dmg.$fn;
    if (!f) return null;
    return chamar(f, [level, ml, skill, atk, def, arm], jogo.helpers || {});
  }

  const api = { avaliar, chamar, danoBaseMagia };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.IdleKnowMotor = api;
})(this);
