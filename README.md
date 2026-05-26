# SolAire W+ Financeiro

Sistema financeiro interno para cadastro de projetos, valores recebidos e transações recorrentes.

## Supabase

Antes do primeiro uso, execute o arquivo `supabase-schema.sql` no SQL Editor do Supabase.

## Build

```bash
npm run build
```

## Deploy Cloudflare Pages

```bash
npm run deploy
```

O deploy publica somente a pasta `dist/`.

Em ambiente não interativo, defina um token da Cloudflare antes do deploy:

```bash
export CLOUDFLARE_ACCOUNT_ID="seu_account_id"
export CLOUDFLARE_API_TOKEN="seu_token"
npm run deploy
```

Configuração sugerida no Cloudflare Pages ao conectar pelo GitHub:

- Build command: `npm run build`
- Build output directory: `dist`
- Project name: `solairew-financeiro`
