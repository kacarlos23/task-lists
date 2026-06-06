# Task Lists

App simples e compartilhado para criar listas e acompanhar itens pendentes.

## Estrutura

- `backend`: API local em Node.js, Express e SQLite.
- `frontend`: app Expo/React Native Web para rodar no navegador.

## Rodar localmente

Backend:

```powershell
cd backend
npm install
npm run dev
```

Frontend:

```powershell
cd frontend
npm install
npm run web
```

Por padrao, o backend roda em `http://localhost:4001` e o frontend chama essa URL.
Se a porta `8081` ja estiver ocupada, rode o Expo em outra porta:

```powershell
cd frontend
npx expo start --web --port 8082
```

Para usar um Cloudflare Tunnel ou outro backend publico:

```powershell
$env:EXPO_PUBLIC_API_URL="https://seu-tunnel.trycloudflare.com"
npm run web
```

Durante desenvolvimento, o backend aceita requisicoes de qualquer porta local (`localhost` ou `127.0.0.1`).
Para producao, configure `CORS_ORIGIN` no backend com a URL do frontend publicado, por exemplo `https://seu-app.vercel.app`.

## API

- `GET /health`
- `GET /groups`
- `POST /groups`
- `DELETE /groups/:id`
- `POST /groups/:groupId/tasks`
- `PATCH /tasks/:id`
- `DELETE /tasks/:id`

