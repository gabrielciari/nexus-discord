# NEXUS Discord

Dashboard web para configurar servidores Discord.

## MVP atual

- Login com Discord OAuth2
- Lista de servidores do usuário
- Verificação de servidores onde o bot está instalado
- Criador de categorias e canais
- Aplicação das alterações usando o bot
- Persistência simples das configurações em JSON
- Interface web mobile-first

## Próximos módulos

1. Tickets
2. Sistema de vendas
3. Emojis
4. Cargos e permissões
5. Templates de servidor
6. Logs e moderação
7. IA para atendimento
8. Banco de dados
9. Sistema multi-servidor

## Configuração

1. Crie uma aplicação no Discord Developer Portal.
2. Crie o Bot dentro da aplicação.
3. Copie `.env.example` para `.env`.
4. Preencha as variáveis.
5. Instale as dependências:

```bash
npm install
```

6. Rode:

```bash
npm run dev
```

7. Abra `http://localhost:3000`.

### Importante

Nunca coloque `DISCORD_BOT_TOKEN` ou `DISCORD_CLIENT_SECRET` no GitHub.
Use `.env` localmente e variáveis de ambiente no deploy.

O bot precisa ter as permissões necessárias no servidor para executar as ações escolhidas.
