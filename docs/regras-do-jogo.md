# Regras do Baiak Idle (engenharia reversa para o otimizador)

Fonte: `https://baiakidle.com/jogar/assets/game-*.js` (o sufixo muda a cada atualização;
achar pelo HTML de `/jogar/`). Nomes de variáveis abaixo são do build `game-B6QzJH3Q.js`
(07/11/2026) — **mudam a cada build**; para reencontrar, use os trechos-âncora indicados.

> Regra de ouro do extrator: **nunca executar** o código do jogo no coletor. Ler os
> objetos literais com um parser (ex.: acorn) e converter só nós literais.

## 1. Tabelas de dados

| Dado | Variável (build atual) | Âncora para achar | Conteúdo |
|---|---|---|---|
| Itens (todos) | `xa` (~500 KB) | `={"200 theons":{` | 9.787 itens; 1.659 equipáveis. Campos: `id, slot, wt, level, vocs[], arm, atk, def, skills{}, magicEl{}, absorb{}, critChance, critDmg, lifeLeech, manaLeech, elementType, elementAtk, wandMin, wandMax, manaShot, range, twoHanded, hitChance, maxHitChance, mantra, reflect, reflectChance, moveSpeed, hpRegen, mpRegen, augments[{spell,kind,value}], imb{slots,cats[]}, ammoType, quiver, perfectShot*, elementalBond, mShield*` |
| Itens base (loja/consumíveis) | `Ae` | `={"gold coin":{` | 197 itens: `value, color, abbr, slot, atk, def…` (o código usa `Ae[nome]` como alias da tabela de itens nas funções de stats) |
| Monstros (stats de combate) | `gc` | `={"ashscale ravager":{` | 469, chave = nome com espaço: `hp, dmg[min,max], armor, resist{el:%}, abilities[{element,min,max,chance,interval,radius/length,target}], ranged` |
| Monstros (hunt) | `ob` | `={troll:{name:"Troll"` | 481, chave com `_`: `name, hp, exp, dmg, speed, armor, resist, abilities, loot[{name,chance(/100000),max}]` |
| Hunts | `ta` (array) | `const ta=[{id:"troll-cave"` | 87 hunts: `id, name, minLevel, monsters[], maxAlive(4), spawnMs(2200), bossKey, avail` |
| Bags de BIS | `tK` | `={"random bis bag":{` | sacolas e itens possíveis |
| Atributos | `g4` | `{id:1,key:"weapon_attack"` | 32 atributos `{id,key,name,bonus,percent}` |
| Imbuements | `Sge` | `{key:"vampirism"` | `{key,name,cat,kind,element?,values[t1,t2,t3]}` |
| Classe do item (1–4) | `TOe` (Map) | `const TOe=new Map([["abyss hammer"` | limite de forja |
| Config Nightmare/Hell | `b0e` → `Ra` | `const b0e={points:` | ver §4 |

## 2. Raridade (tier do item)
- `TM`: 1 Uncommon (1 atributo, nível máx 4) · 2 Rare (2, 6) · 3 Epic (3, 8) · 4 Legendary (4, 10) · 5 Mythical (5, 12)
- `PDe`: 6 Celestial (6, 14) · 7 Cosmic (7, 16)
- Tier ≥ 6 (`Yy`): `nmDmg += 35` e `nmWard += 35` (`Iv=35`). Tier ≥ 7 (`A0`): também `hlDmg += 35`, `hlWard += 35`.

## 3. Somatório de stats (`Y9(stats, itemEquipado)`, stats zerados por `Sr()`)
Campos de `Sr()`: `atkPct, defFlat, armorFlat, critChance, critDmg, lifeLeech, manaLeech, hpPct, manaPct, expPct, lootPct, spellDmgPct, attackSpeedPct, spellHealPct, hpRegenPct, mpRegenPct, hpRegenFlat, mpRegenFlat, moveSpeed, reflect, reflectProcChance, reflectProcPct, onslaught, momentum, ruse, transcendence, amplification, onslaughtTier, execute, nmDmg, nmWard, hlDmg, hlWard, absorbPct{7 elementos}, mantra, elementDmgPct{7}`.

Por item:
- **Upgrade +N**: arma → `atkPct += N`; outros com `def` → `armorFlat += def × N × 0.005`.
- `absorb` do item → `absorbPct[el] = vd(atual, v)`, com **`vd(a,b) = a + b − a·b/100`** (proteções se multiplicam, não somam).
- `mantra` conta só em helmet/amulet/armor/legs/ring. `bonus{}` soma direto. `hpRegen/mpRegen/moveSpeed` somam.
- `reflect` com `reflectChance` → proc (máx da chance, soma do %); sem chance → `reflect` fixo.
- **Forja (`ftier` N)**: slot define o proc — weapon→onslaught, helmet→momentum, armor→ruse, legs→transcendence, boots→amplification. Valor `Yd(proc,N) = a·N² + b·N + c` com `MOe`: onslaught [.05,.4,.05], momentum [.05,1.9,.05], ruse [.0307576,.440697,.026], transcendence [.0127,.107,.0073], amplification [.4,1.7,.4]. Limite de forja: classe do item ≥4 → 10; senão = classe.
- **Atributos**: valor = `bonus × level` (`Zu`). Mapeamento id → stat: 1 atkPct · 2 defFlat · 3 armorFlat · 4 onslaught · 5 critChance · 6 critDmg · 7 lifeLeech · 8 manaLeech · 9 lootPct · 10 expPct · 11 todas as proteções (vd) · 12–17 proteção fire/earth/energy/ice/holy/death (vd) · 18 attackSpeedPct · 19 spellDmgPct · 20 spellHealPct · 21 hpPct · 22 manaPct · 23 hpRegenPct · 24 mpRegenPct · 25 execute · 26 attackSpeedPct (Frenzy) · 27–32 dano elemental fire/earth/energy/ice/holy/death.
  Bônus por nível (g4): Weapon Attack 1% · Defense 2 · Armor 1 · Onslaught .5% · Crit Chance .35% · Crit Damage 1.5% · Life/Mana Leech .4% · Loot 1% · Exp 1% · Protect All .17% · Protect <el> .5% · Attack Speed .5% · Spell Dmg/Heal .5% · Max HP/Mana .5% · HP/MP Regen .08% · Execute .25% · Frenzy .25% · <El> Damage .5%.
- **Imbuements** (`values` por tier 1/2/3): vampirism (life leech) 5/10/25 · void (mana leech) 3/5/8 · strike (crit) critDmg +5/15/40 e critChance +5 (`Ege`) · scorch etc. (elemdmg: % do dano vira o elemento) · protect (vd na proteção) · speed.

## 4. Nightmare / Hell (`Ra = JRe(b0e)`)
`Nae(hp, bossHp, atk, exp, expPerStep, itemChance)` → `{hp, bossHp, atk, exp, expPerStep, gold:1, killTimeTarget:1.2, killTimeMinNormalMs:800, itemChance, dealtFloor:.1, resistPp:25, resistCap:90, boltChance:40, boltMin:.8, boltMax:1, boltIntervalMs:2000, novaChance:30, novaMin:.4, novaMax:.5, novaIntervalMs:3000, recHead:1.1, …}`
- `nm = Nae(12, 5, 5, 3.25, .19, 1.1)` → monstros com HP ×12, boss ×5, ataque ×5, XP 3.25 + 0.19 por degrau.
- `hl = {...Nae(24,10,10,6.5,.38,1.2), recPlus:.05, celestialCap:950, overNm:1.3}`
- **Véu da hunt** `Gy(hunt,mode) = Ra.rec[hunt]` (hl: ×1.05). `rec` interpolado por level a partir de `YRe` (troll-cave 100 … hydra 110 …).
- **Dano causado** `xbe = dealtFloor + (1−dealtFloor) · min(1, nmDmg / Véu)` → sem Ressonância = 10% do dano.
- **Redução de dano recebido** `zF = min( min(100+ward, recHead·Véu)/100 , atk )`.
- Degrau da hunt `n$e = 1 + (pos−1)·19/(nHunts−1)` (1 a 20).
- Bolt/Nova de Nightmare ignoram proteções de elemento; só "Dread/Ember Resistance" (Rift Tree) e o Manto reduzem.

## 5. Ainda falta mapear
- Fórmula do dano do jogador (auto-ataque por arma/varinha, skill/magic level, atkPct, crit, onslaught/fatal, execute, attack speed) e das magias (rotação, cooldowns, `augments`).
- Dano recebido: armadura/defesa do jogador, absorb, mantra, esquiva (ruse), reflect.
- XP/h e loot/h: XP dos monstros × expPct × boosts; loot `chance/100000` × lootPct; kill time vs `spawnMs`/`maxAlive`.
- Charms, proficiência de arma, Rift Tree, addons/auras/montarias (bônus de conta), especializações.
- Validar tudo contra o painel "Bônus" do personagem no jogo.
