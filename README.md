# Excalidraw self-hosted

Editor de desenhos à mão baseado no [Excalidraw](https://excalidraw.com/) open source, com backup no Postgres. Feito para uso pessoal: sem colaboração em tempo real, com persistência para abrir os mesmos desenhos em qualquer computador.

- **Front:** Next.js na [Vercel](https://vercel.com/) (`apps/web`)
- **API:** Node.js (Fastify) no [Railway](https://railway.com/) (`apps/api`)
- **Banco:** PostgreSQL no Railway

## Como usar localmente

1. Suba o Postgres:

```bash
docker compose up -d
```

2. Configure a API:

```bash
cp apps/api/.env.example apps/api/.env
```

3. Configure o front:

```bash
cp apps/web/.env.example apps/web/.env.local
```

4. Instale e rode:

```bash
npm install --prefix apps/api
npm install --prefix apps/web
npm run dev:api
npm run dev:web
```

Abra [http://localhost:3000](http://localhost:3000) e entre com a senha definida em `APP_PASSWORD`.

## Deploy

O repositório está ligado à **branch `main`**:

- Vercel faz o build de `apps/web` a cada push
- Railway faz o build de `apps/api` a cada push

Variáveis necessárias:

**API (Railway)**

- `DATABASE_URL` — referência `${{Postgres.DATABASE_URL}}`
- `APP_PASSWORD` — senha de acesso
- `JWT_SECRET` — segredo longo e aleatório
- `FRONTEND_URL` — URL de produção da Vercel

**Web (Vercel)**

- `NEXT_PUBLIC_API_URL` — URL pública da API no Railway (sem barra no final)
