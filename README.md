# Rifa

Site simples e responsivo de rifa com Bootstrap, JavaScript, SDK client do Mercado Pago e registro de compras no Firebase.

## Funcionalidades
- Seleção visual de números da rifa
- Formulário com nome, CPF, telefone e e-mail
- Início do pagamento via SDK client do Mercado Pago (`checkout`)
- Confirmação de pagamento consultando backend
- Registro da compra no Firestore (`rifaPurchases`) para disparo posterior de e-mail/SMS via trigger no Firebase

## Arquivos principais
- `index.html`
- `styles.css`
- `app.js`
- `config.example.js`

## Configuração
1. Copie `config.example.js` para `config.js` e preencha com suas chaves reais.
2. Configure no backend os endpoints:
   - `POST /create-preference` → retorna `{ "preferenceId": "..." }`
   - `GET /payment-status?preferenceId=...` → retorna `{ "status": "approved", "paymentId": "..." }`
3. Publique uma Cloud Function/trigger do Firebase para escutar `rifaPurchases` e enviar e-mail/SMS.

## Execução local
Abra um servidor estático na raiz do projeto, por exemplo:

```bash
cp config.example.js config.js
python -m http.server 8000
```

Depois acesse `http://localhost:8000`.
