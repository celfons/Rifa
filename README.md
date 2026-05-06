# Rifa

Site de rifa responsivo com Bootstrap + JavaScript e backend em **Hono** pronto para deploy no **Cloudflare Workers** e **Cloudflare Pages Functions**.

## Funcionalidades
- Seleção visual de números da rifa
- Formulário com nome, CPF, telefone e e-mail
- Pagamento com SDK client do Mercado Pago
- APIs da rifa publicadas no backend Hono
- Registro pós-confirmação no Firebase (Firestore) via API backend

## Estrutura
- Front-end: `index.html`, `styles.css`, `app.js`, `config.example.js`
- API Hono (Worker): `src/hono-app.ts`, `src/worker.ts`
- API Hono (Pages Functions): `functions/[[path]].ts`
- Configuração Cloudflare: `wrangler.toml`

## Endpoints da API (Hono)
- `GET /api/rifas` → lista rifas disponíveis
- `POST /api/pagamentos/preferencia` → cria preferência no Mercado Pago
- `GET /api/pagamentos/status?preferenceId=...` → consulta status de pagamento
- `POST /api/rifas/:id/confirmacao` → recebe dados pós-confirmação e salva no Firestore

## Configuração do front-end
1. Copie `config.example.js` para `config.js`.
2. Ajuste:
   - `MERCADO_PAGO_PUBLIC_KEY`
   - `API_BASE_URL` (em Cloudflare, normalmente `/api`)
   - `RAFFLE_ID` (opcional)

## Configuração de variáveis no Cloudflare (backend)
Defina no Worker/Pages:
- `MERCADO_PAGO_ACCESS_TOKEN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_API_KEY`
- `RIFAS_JSON` (opcional, JSON com rifas)

Exemplo de `RIFAS_JSON`:
```json
[{"id":"rifa-principal","nome":"Rifa Solidária","preco":10,"totalNumeros":100}]
```

## Desenvolvimento local
```bash
npm install
cp config.example.js config.js
npm run typecheck
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
