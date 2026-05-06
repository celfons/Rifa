# Rifa

Site simples e responsivo de rifa com Bootstrap, JavaScript, SDK client do Mercado Pago e registro de compras no Firebase.

## Funcionalidades
- Seleção visual de números da rifa
- Formulário com nome, CPF, telefone e e-mail
- Início do pagamento via SDK client do Mercado Pago (`checkout`)
- Confirmação de pagamento consultando backend
- Registro da compra no Firestore (`rifaPurchases`) para disparo posterior de e-mail/SMS via trigger no Firebase

## Arquivos principais
- `/home/runner/work/Rifa/Rifa/index.html`
- `/home/runner/work/Rifa/Rifa/styles.css`
- `/home/runner/work/Rifa/Rifa/app.js`
- `/home/runner/work/Rifa/Rifa/config.example.js`

## Configuração
1. Edite `config.example.js` com suas chaves reais (ou renomeie para `config.js` e ajuste o import no `index.html`).
2. Configure no backend os endpoints:
   - `POST /create-preference` → retorna `{ "preferenceId": "..." }`
   - `GET /payment-status?preferenceId=...` → retorna `{ "status": "approved", "paymentId": "..." }`
3. Publique uma Cloud Function/trigger do Firebase para escutar `rifaPurchases` e enviar e-mail/SMS.

## Execução local
Abra um servidor estático na raiz do projeto, por exemplo:

```bash
cd /home/runner/work/Rifa/Rifa
python -m http.server 8000
```

Depois acesse `http://localhost:8000`.
