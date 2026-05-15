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
- Página de compradores: `public/compradores.html`, `public/compradores.js`
- API Hono (Worker): `src/hono-app.ts`, `src/worker.ts`
- API Hono (Pages Functions): `functions/[[path]].ts`
- Configuração Cloudflare: `wrangler.toml`

## Endpoints da API (Hono)
- `GET /openapi.json` → especificação OpenAPI 3.0 da API
- `GET /swagger` → interface Swagger UI para explorar e testar endpoints
- `GET /api/rifas` → lista rifas disponíveis
- `GET /api/config` → retorna configuração pública por tenant (ex.: chave pública do Mercado Pago)
- `POST /api/pagamentos/preferencia` → cria preferência no Mercado Pago
- `GET /api/pagamentos/status?preferenceId=...` → consulta status de pagamento
- `POST /api/rifas/:id/confirmacao` → recebe dados pós-confirmação e salva no D1
- `GET /api/rifas/:id/confirmacoes?limit=100` → lista confirmações salvas no D1
- `GET /api/rifas/:id/numeros-comprados` → lista números comprados da rifa
- `GET /api/compradores?limit=100` → lista compradores do tenant atual (Cloudflare D1)

## Configuração do front-end
1. Copie `public/config.example.js` para `public/config.js`.
2. Ajuste:
   - `MERCADO_PAGO_PUBLIC_KEY` (opcional para fallback local; em produção use a variável de ambiente no backend)
   - `API_BASE_URL` (em Cloudflare, normalmente `/api`)
   - `RAFFLE_ID` (opcional)
   - `TICKET_PRICE` e `TOTAL_NUMBERS` (fallback quando a API `/api/rifas` estiver indisponível)

## Configuração de variáveis no Cloudflare (backend)
Defina no Worker/Pages:
- `MERCADO_PAGO_ACCESS_TOKEN` (string ou JSON por tenant)
- `MERCADO_PAGO_PUBLIC_KEY` (string ou JSON por tenant; usado pelo endpoint `GET /api/config`)
- `RIFAS_JSON` (opcional, JSON com rifas; pode ser global ou por tenant)
- `TENANT_ROOT_DOMAIN` (ex.: `example.com`, habilita multi-tenant por subdomínio)
- `TENANT_DEFAULT_ID` (opcional, padrão: `default`)
- `TENANT_MAP_JSON` (opcional, JSON `{ "subdominio": "tenant_id" }`)
- `TENANT_IGNORED_SUBDOMAINS` (opcional, CSV; padrão: `www`)
- `TENANT_ALLOW_HEADER_OVERRIDE` (opcional: `1` para aceitar header `x-rifa-tenant` em dev)

Configure o binding do D1 com o nome `DB` no `wrangler.toml` e no painel da Cloudflare (Workers ou Pages). Informe o `database_id` do seu banco D1 no `wrangler.toml` (de preferência em um bloco de ambiente como `[env.production]`).

Exemplo de `RIFAS_JSON`:
```json
[{"id":"rifa-principal","nome":"Rifa Solidária","preco":10,"totalNumeros":100}]
```

Exemplo de `RIFAS_JSON` por tenant (por subdomínio), usando `default` como fallback:
```json
{
  "default": [{"id":"rifa-principal","nome":"Rifa Solidária","preco":10,"totalNumeros":100}],
  "cliente-a": [{"id":"rifa-a","nome":"Rifa Cliente A","preco":20,"totalNumeros":500}]
}
```

Exemplo de `MERCADO_PAGO_ACCESS_TOKEN` por tenant:
```json
{
  "default": "TOKEN_PADRAO",
  "cliente-a": "TOKEN_DO_CLIENTE_A"
}
```

Exemplo de `MERCADO_PAGO_PUBLIC_KEY` por tenant:
```json
{
  "default": "APP_USR-CHAVE_PUBLICA_PADRAO",
  "cliente-a": "APP_USR-CHAVE_PUBLICA_CLIENTE_A"
}
```

Exemplo para tenant igual ao subdomínio (`maya` em `maya.example.com`), no Cloudflare:

```env
TENANT_ENABLED=1
TENANT_ROOT_DOMAIN=example.com
TENANT_DEFAULT_ID=default
TENANT_IGNORED_SUBDOMAINS=www
```

```json
// RIFAS_JSON
{
  "default": [{"id":"rifa-principal","nome":"Rifa Solidária","preco":10,"totalNumeros":100}],
  "maya": [{"id":"rifa-maya","nome":"Rifa Maya","preco":15,"totalNumeros":200}]
}
```

```json
// MERCADO_PAGO_ACCESS_TOKEN
{
  "default": "TOKEN_PADRAO",
  "maya": "TOKEN_DO_TENANT_MAYA"
}
```

Com essa configuração, quando a URL for `maya.example.com`, o tenant resolvido será `maya` (igual ao subdomínio). Nesse cenário, `TENANT_MAP_JSON` não é necessário.

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
