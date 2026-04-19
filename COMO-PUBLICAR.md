# Como Publicar — Guia Completo

## Estrutura do Projeto

```
yt-backend/
├── server.js          ← backend seguro (chave da API aqui, no servidor)
├── package.json
├── .env.example       ← modelo para variáveis de ambiente
├── .gitignore         ← protege o .env de ser exposto
└── public/
    └── index.html     ← frontend (sem chaves, sem segredos)
```

---

## Opção A — Railway (recomendado, grátis)

1. Cria conta em https://railway.app
2. Clica "New Project" → "Deploy from GitHub repo"
3. Faz upload ou conecta o repositório com estes ficheiros
4. Vai a **Variables** no painel do Railway e adiciona:
   - `RAPIDAPI_KEY` = a_tua_chave_rapidapi
   - `ALLOWED_ORIGIN` = https://o-teu-dominio.railway.app
5. Railway faz o deploy automaticamente
6. O teu site fica em: https://yt-backend-xxxx.railway.app

---

## Opção B — Render (grátis)

1. Cria conta em https://render.com
2. "New" → "Web Service" → conecta o repositório
3. Build Command: `npm install`
4. Start Command: `node server.js`
5. Em "Environment Variables" adiciona:
   - `RAPIDAPI_KEY` = a_tua_chave_rapidapi
6. Clica "Create Web Service"

---

## Opção C — Localmente (para testar)

```bash
# 1. Instala dependências
npm install

# 2. Cria o ficheiro .env
cp .env.example .env
# Edita .env e coloca a tua chave

# 3. Inicia o servidor
node server.js

# 4. Abre no browser
# http://localhost:3000
```

---

## Segurança Implementada

- Chave da API nunca exposta ao browser
- Rate limiting: máx 30 pedidos por IP a cada 10 minutos
- Validação de input: só aceita URLs do YouTube
- Headers de segurança via Helmet
- CORS configurável por domínio
- Nenhum dado do utilizador é guardado

---

## IMPORTANTE

Nunca comitas o ficheiro `.env` no GitHub.
O `.gitignore` já está configurado para o ignorar.
Usa sempre as variáveis de ambiente da plataforma (Railway/Render).
