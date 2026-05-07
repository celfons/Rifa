# Rifa

Site de rifa responsivo com Bootstrap + JavaScript e backend em **Hono** pronto para deploy no **Cloudflare Workers** e **Cloudflare Pages Functions**.

## Funcionalidades
- Seleção visual de números da rifa
- Formulário com nome e telefone
- Pagamento com SDK client do Mercado Pago
- APIs da rifa publicadas no backend Hono
- Registro pós-confirmação no Cloudflare D1 via API backend

## Estrutura
- Front-end: `public/index.html`, `public/styles.css`, `public/app.js`, `public/config.example.js`
- API Hono (Worker): `src/hono-app.ts`, `src/worker.ts`
- API Hono (Pages Functions): `functions/[[path]].ts`
- Configuração Cloudflare: `wrangler.toml`

## Endpoints da API (Hono)
- `GET /api/rifas` → lista rifas disponíveis
- `POST /api/pagamentos/preferencia` → cria preferência no Mercado Pago
- `GET /api/pagamentos/status?preferenceId=...` → consulta status de pagamento
- `POST /api/rifas/:id/confirmacao` → recebe dados pós-confirmação e salva no D1
- `GET /api/rifas/:id/confirmacoes?limit=100` → lista confirmações salvas no D1
- `GET /api/rifas/:id/numeros-comprados` → lista números comprados da rifa

## Configuração do front-end
1. Copie `public/config.example.js` para `public/config.js`.
2. Ajuste:
   - `MERCADO_PAGO_PUBLIC_KEY`
   - `API_BASE_URL` (em Cloudflare, normalmente `/api`)
   - `RAFFLE_ID` (opcional)

## Configuração de variáveis no Cloudflare (backend)
Defina no Worker/Pages:
- `MERCADO_PAGO_ACCESS_TOKEN`
- `RIFAS_JSON` (opcional, JSON com rifas)

Configure o binding do D1 com o nome `DB` no `wrangler.toml` e no painel da Cloudflare (Workers ou Pages). Informe o `database_id` do seu banco D1 no `wrangler.toml` (de preferência em um bloco de ambiente como `[env.production]`).

Exemplo de `RIFAS_JSON`:
```json
[{"id":"rifa-principal","nome":"Rifa Solidária","preco":10,"totalNumeros":100}]
```

## Desenvolvimento local
```bash
npm install
cp public/config.example.js public/config.js
npm run typecheck
```

Para criar o schema do D1 local, use as migrations em `migrations/`:
```bash
wrangler d1 migrations apply rifa-db --local
```

Para subir API local do Worker:
```bash
npm run dev
```

## Deploy Cloudflare
### Worker
```bash
npm run deploy
```

### Pages Functions
No projeto Pages, mantenha a pasta `functions/` e configure as mesmas variáveis de ambiente. O handler Hono em `functions/[[path]].ts` publica os mesmos endpoints `/api/*`.
