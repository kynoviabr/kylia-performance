# Kylia Performance by Kynovia

MVP independente da Kylia Performance, produto da Kynovia, criado a partir do Documento Master de Produto e do schema Supabase anexados.

Tagline EN: Smart Goals. Real Results.

Tagline PT: Smart Goals. Real Results.

## Rodar localmente

```bash
npm install
npm run dev
```

O app abre em modo demo quando `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` não estão configuradas. Para conectar ao Supabase, execute `supabase/kylia_schema.sql` no SQL Editor do projeto Supabase e preencha as variáveis em `.env`.

## Escopo implementado

- Auth/onboarding visual com e-mail/senha e Google OAuth preparado.
- CEO Dashboard com cards por time, evolução semanal e alertas de KRs.
- Lista de objetivos com filtros por ciclo, time e status.
- Detalhe de objetivo com KRs, progresso, dono, confiança e status.
- Modal de atualização de KR com novo valor, comentário e bloqueio.
- Gestão de times, usuários e convites para administradores.
- Design system dark conforme o documento: sage green, semáforos, DM Sans/Serif/Mono, cards e painéis.
