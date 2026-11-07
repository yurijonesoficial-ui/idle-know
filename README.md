# Idle-Know

> "I don't know…" — o Idle-Know sabe.

Site público com preços, dicas e oportunidades do market do **Baiak Idle**, mais a busca de personagem pelo nick.

## Como funciona

| Parte | O que faz | Onde roda |
|---|---|---|
| `public/` | O site (uma página só, sem dependências) | Cloudflare Pages |
| `functions/api/personagem.js` | `/api/personagem?nick=…` — busca o personagem no jogo | Cloudflare Pages Functions |
| `scripts/coletar.mjs` | Coleta o market a cada 6 horas | GitHub Actions |
| `.github/workflows/coletar.yml` | O agendamento da coleta | GitHub Actions |
| `dados/vendas/AAAA-MM.json` | As vendas do mês em andamento (o "armazém") | No próprio repositório |
| `public/data/atual.json` | Últimos 7 dias + anúncios abertos | Publicado com o site |
| `public/data/meses/` | O resumo de cada mês (fica para sempre) | Publicado com o site |

**Virada do mês:** 8 dias depois que o mês vira, o mês anterior é fechado. O resumo dele continua no site para sempre, e as vendas detalhadas daquele mês são apagadas. A espera de 8 dias existe porque o jogo só mostra os últimos 7 dias de histórico.

Tudo usa só dados **públicos** do jogo (os mesmos que o site do Baiak Idle mostra sem login). A coleta é educada: uma requisição a cada 0,4 s, só 4 vezes por dia, e só busca o que é novo.

---

## Colocar no ar (passo a passo, ~15 minutos)

Tudo gratuito. Você só paga se quiser um domínio próprio.

### 1. Criar o repositório no GitHub
1. Crie uma conta em **github.com** (se ainda não tiver).
2. Clique em **New repository** → nome `idle-know` → **Public** → **Create repository**.
3. Na página do repositório vazio, clique em **uploading an existing file** e arraste **todo o conteúdo** desta pasta (incluindo a pasta `.github`). Clique em **Commit changes**.
   - Dica: se a pasta `.github` não aparecer para arrastar, crie o arquivo na mão: **Add file → Create new file**, nome `.github/workflows/coletar.yml`, e cole o conteúdo.

### 2. Rodar a primeira coleta
1. No repositório, vá em **Actions** → se pedir, clique em **I understand my workflows, go ahead and enable them**.
2. Clique em **Coletar market** → **Run workflow** → **Run workflow**.
3. Espere uns 2 minutos até ficar verde ✅. Ele vai criar `public/data/` e `dados/vendas/` com os dados reais.
4. Se der erro de permissão no passo "Salvar dados": **Settings → Actions → General → Workflow permissions → Read and write permissions → Save**, e rode de novo.

### 3. Publicar o site na Cloudflare
1. Crie uma conta em **dash.cloudflare.com** (grátis).
2. **Workers & Pages → Create → Pages → Connect to Git** → autorize o GitHub → escolha `idle-know`.
3. Configuração do build:
   - **Framework preset:** None
   - **Build command:** *(deixe vazio)*
   - **Build output directory:** `public`
4. **Save and Deploy.** Em 1 minuto o site estará em `https://idle-know.pages.dev` (ou parecido).

A pasta `functions/` é detectada sozinha — a busca por nick já funciona.

Daqui pra frente, **não precisa fazer mais nada**: a cada 6 horas o GitHub coleta, salva os dados no repositório, e a Cloudflare republica o site sozinha.

### 4. (Opcional) Domínio próprio
Compre o domínio (ex.: `idle-know.com` ou `idleknow.com.br`) e, no projeto do Pages, vá em **Custom domains → Set up a custom domain**.

---

## Testar no seu computador (opcional)
```bash
node scripts/coletar.mjs          # coleta de verdade (precisa de internet)
npx wrangler pages dev public     # sobe o site + a função em http://localhost:8788
```

## Boas práticas com o jogo
- A coleta se identifica como `IdleKnow/1.0` no User-Agent.
- Vale avisar a equipe do Baiak Idle que o site existe. Se eles pedirem para diminuir a frequência, mude o `cron` em `.github/workflows/coletar.yml`.
