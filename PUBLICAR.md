# Publicação — 73 Aviation

Repositório privado `arthurmaiarodrigues/73-aviation` no GitHub, projeto
`73-aviation` na Vercel, **deploy automático a cada push na `main`** e URL
de preview em cada Pull Request. Banco: projeto `RV10 PP-ZNM` no Supabase.

## Primeira publicação (uma vez)

1. **GitHub** — <https://github.com/new>: nome `73-aviation`, **Private**,
   sem README/.gitignore/licença (o repositório já existe aqui). Create.
2. No terminal, em `C:\RV10 PP-ZNM`:
   ```bash
   git remote add origin https://github.com/arthurmaiarodrigues/73-aviation.git
   git push -u origin main
   ```
3. **Vercel** — <https://vercel.com/new>: Import `arthurmaiarodrigues/73-aviation`.
   Framework Next.js é detectado sozinho. Antes de Deploy, abra
   **Environment Variables** e cole as quatro do `.env.local` mais a quinta:

   | variável | valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | do `.env.local` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | do `.env.local` (`sb_publishable_…`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | do `.env.local` (`sb_secret_…`) — **segredo** |
   | `ANTHROPIC_API_KEY` | do `.env.local` — **segredo** |
   | `NEXT_PUBLIC_SITE_URL` | `https://73-aviation.vercel.app` (ajuste se a Vercel der outro nome) |

   Deploy. Em ~2 min sai a URL.
4. **Supabase → Authentication → URL Configuration**:
   - Site URL: `https://73-aviation.vercel.app`
   - Redirect URLs: `https://73-aviation.vercel.app/**` e `http://localhost:3073/**`

   Sem isso o link de convite/redefinição de senha cai no lugar errado.
5. **Sócios**: Supabase → Authentication → Users → **Invite user** com o
   e-mail de cada um (MARCELINO, CAETANO, WANDERSON). O convite leva para
   `/auth/definir-senha`. Depois, em **Cadastros → Usuários**, confira o
   perfil `socio` e, em **Sócios**, vincule cada login ao sócio. (Ou, no
   terminal: `npm run criar-usuario -- email senha "NOME" socio`, que já
   vincula pelo apelido.)
6. **Celular**: abrir a URL no Chrome (Android) ou Safari (iPhone) →
   "Adicionar à tela de início". Vira app com o ícone da 73.

## Como uma mudança chega em produção

```bash
git add -A
git commit -m "o que mudou"
git push
```

## Migration antes do deploy, nunca depois

Se a mudança precisa de SQL novo (`db/patches/*.sql` ou `db/schema.sql`),
rode no SQL Editor **antes** do push, e termine com
`notify pgrst, 'reload schema';` (CLAUDE.md §9).

## Variáveis

Mudou uma chave no Supabase ou na Anthropic? Troque na Vercel
(Settings → Environment Variables) **e** no `.env.local`, e faça um
redeploy (Deployments → ⋯ → Redeploy).
