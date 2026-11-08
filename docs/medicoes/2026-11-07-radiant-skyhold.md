# Medição 1 — Radiant Skyhold (modo normal), 07/11/2026, ~9 min

Party: **Mago de Festa** (MS 1332, Necromancer) · **Reon Jones** (EK 1193) · **Enfermeira Gostosa** (ED 1217, Priest).
Fonte: Hunt Analyzer, Damage, Damage Taken, Spell Damage, Charm e Proc Analyzer do jogo.

## Totais (9:08)
- XP/h 344,7 mi · XP raw/h 203,3 mi · 263 kills · Loot 10,39 mi (68,5 mi/h) · Supplies 10,89 mi (72,1 mi/h)
- Dano: MS 28.679/s · EK 7.113/s · ED 18.297/s
- Dano recebido: MS 59/s · EK 2.208/s · ED 77/s
- Procs: Onslaught 107 · Momentum 29 · Ruse 14 · Transcendence 44 · Charms 165 (2,07 mi de dano)

## Fichas (painel "Bônus")
| | MS | ED | EK |
|---|---|---|---|
| Level | 1332 | 1217 | 1193 |
| Skill principal | Magic 124+63 | Magic 124+55 | Melee 115+61 |
| Dano de magia | +167,1% | +130,6% | +13,6% |
| Ataque | +16,9% | +11,9% | +42,9% |
| Crítico (chance / dano) | 31,5% / 174,6% | 23,4% / 110,6% | 20,7% / 137,1% |
| Onslaught | 13,9% | 2,5% | 3,7% |
| Dano elemental | energy 26,2 · fire 7,2 · death 17,8 | earth 15,4 · ice 9,6 · death 0,5 | — |
| Velocidade de ataque | +6% | +0,25% | +18% |
| Armadura / Defesa | 44,1 / 22 | 43,5 / 16 | 86,7 / 116 |
| Amplification | 9,1% | 2,5% | 2,5% |

## Magias (média por golpe, % de crítico observado, máximo)
| Magia | Golpes | Média | Crít. | Máx. | Fórmula do jogo × bônus da ficha × resistência × crítico | Real ÷ modelo |
|---|---|---|---|---|---|---|
| Rage of the Skies (MS) | 137 | 35,7k | 59% | 74,1k | 22,6k | 1,58 |
| Death Nova (MS) | 125 | 28,5k | 72% | 61,4k | 18,7k | 1,53 |
| Hell's Core (MS) | 135 | 24,3k | 53% | 52,9k | 14,9k | 1,63 |
| Thunderstorm runa (MS) | 271 | 11,3k | 66% | 24,2k | 8,0k | 1,41 |
| Sudden Death runa (MS) | 14 | 14,9k | 71% | 21,8k | 9,6k | 1,55 |
| Ultimate Energy Strike (MS) | 13 | 14,0k | 77% | 22,6k | 9,4k | 1,49 |
| Wrath of Nature (ED) | 157 | 24,1k | 59% | 45,9k | 13,8k | 1,75 |
| Eternal Winter (ED) | 118 | 21,5k | 42% | 47,8k | 12,3k | 1,75 |
| Stone Shower runa (ED) | 370 | 6,5k | 59% | 12,9k | 4,5k | 1,43 |
| Fierce Berserk (EK) | 212 | 7,3k | 47% | 16,2k | | |
| Groundshaker (EK) | 245 | 4,7k | 56% | 10,0k | | |
| Ataque básico (EK) | 192 | 3,6k | 54% | 8,0k | | |
| Ataque básico (MS) | 248 | 1,5k | 60% | 3,1k | varinha 113–125 → ~100 | ~15 |

## Conclusões
1. **Os máximos batem com "crítico + onslaught dobra o dano"**: máx. real ÷ (máx. da fórmula × bônus × crítico) ≈ 2,0–2,25 em todas as magias do MS (≈ ×2 do onslaught × Amplification 9,1%).
2. **As médias ficam 40–75% acima do modelo simples.** A sobra é parecida dentro de cada personagem (MS ~1,5, ED ~1,6–1,75) e menor nas runas. Falta um multiplicador do servidor que ainda não identificamos.
3. **O ataque básico usa outra fórmula** (a varinha de 113–125 bate ~1.500): no servidor, escala com magic level/level.
4. **O crítico real é bem maior que o da ficha** (59–77% contra 31,5%): há fontes extras (charm Low Blow, augments, avatar).

## Próximas medições (uma variável por vez)
- Trocar só **uma peça** (ex.: tirar o anel de crítico) e repetir 10 min na mesma hunt → mede o peso real de cada stat.
- Mesma build em **outra hunt** com resistências diferentes → separa resistência do multiplicador desconhecido.

---

# Medição 2 — combat log golpe a golpe (08/11/2026, ~10 min, bosses)

O cliente recebe pelo websocket (Colyseus, mensagens msgpack) o `combatlog` de cada golpe:
`{k:"dealt", voc, foe:{name}, amount, el, crit, fatal, killed}` e `{k:"taken", voc, foe, el, hp, mana, crit}`,
além de `fx` com `cd` (`slot` = membro da party, `words`, `cd`, `gcd`) e `atk` (`memberId`, `cd` do ataque básico).
Isso permite separar cada magia, crítico e fatal. Monstros usados: The Monster e Court Warlock (resistência 0).

**Resultados (entram em `public/motor.js`, objeto `CAL`):**
- **Ataque básico:** intervalo = 2000 / (1 + Velocidade de ataque). Exato (MS 1886,8 ms com +6%; EK 1694,9 com +18%).
- **Global cooldown:** magias de ataque e runas dividem 2 s; curas usam 1 s à parte.
- **Crítico:** multiplicador = 1 + 0,5 + Dano crítico (MS 3,32 medido × 3,25 previsto; ED 2,65 × 2,61; EK 2,78 × 2,87).
- **Chance de crítico real** ≈ painel + ~28 p.p. (MS 56% com 31,5% no painel; ED 51% com 23,4%; EK 54% com 20,7%).
- **Fatal (onslaught):** soma +60% (não multiplica o crítico): normal → ×1,6; crítico+fatal → +0,6 sobre o crítico.
  Frequência ≈ onslaught × (1 + Amplification).
- **Runas:** dano sem crítico = fórmula × (1+Dano de magia) × (1+Dano do elemento) × **1,09** (MS e ED batem).
- **Magias:** a mesma conta dá × 1,18 a 1,44 (Rage 1,18 · Death Nova 1,21 · Hell's Core 1,24 · Wrath of Nature 1,33 · Eternal Winter 1,44). Ainda sem explicação; usado por magia.
- **Magic level por elemento** (`magicEl` dos itens, ex.: Norcferatu Bonecloak earth +6) entra no "t" da fórmula.
- **Varinha/rod:** ataque básico ≈ média da varinha × (1 + Ataque) × level × 0,00462 (MS e ED batem).
- **Melee:** ≈ (atk + ataque elemental) × (1 + Ataque) × skill × 0,126 (só 1 personagem medido).
- Magias de arma do knight dividem o dano entre físico e o elemento da arma na proporção atk : ataque elemental.
