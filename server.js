require("dotenv").config();

const express = require("express");
const session = require("express-session");
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const dataDir = path.join(process.cwd(), "data");
const configFile = path.join(dataDir, "servers.json");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(configFile)) fs.writeFileSync(configFile, "{}");

function readConfigs() {
  try { return JSON.parse(fs.readFileSync(configFile, "utf8")); }
  catch { return {}; }
}

function writeConfigs(data) {
  fs.writeFileSync(configFile, JSON.stringify(data, null, 2));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-only-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax" }
}));

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Não autenticado." });
  next();
}

function discordOAuthUrl() {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds"
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

app.get("/auth/login", (req, res) => {
  res.redirect(discordOAuthUrl());
});

app.get("/auth/callback", async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send("Código OAuth ausente.");

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI
      })
    });

    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok) return res.status(400).json(tokens);

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const user = await userResponse.json();

    const guildResponse = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const guilds = await guildResponse.json();

    req.session.user = user;
    req.session.guilds = Array.isArray(guilds) ? guilds : [];
    res.redirect("/");
  } catch (error) {
    console.error(error);
    res.status(500).send("Falha no login.");
  }
});

app.get("/auth/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.get("/api/me", requireLogin, async (req, res) => {
  const botGuilds = client.guilds.cache.map(g => ({ id: g.id, name: g.name, icon: g.icon }));
  const manageable = req.session.guilds
    .filter(g => ((BigInt(g.permissions || "0") & BigInt(PermissionFlagsBits.ManageGuild)) === BigInt(PermissionFlagsBits.ManageGuild)))
    .map(g => ({
      ...g,
      botInstalled: client.guilds.cache.has(g.id)
    }));

  res.json({
    user: req.session.user,
    guilds: manageable,
    botGuilds
  });
});

app.get("/api/guild/:guildId/structure", requireLogin, async (req, res) => {
  try {
    const guild = await client.guilds.fetch(req.params.guildId);
    const channels = await guild.channels.fetch();

    const categories = channels
      .filter(c => c && c.type === ChannelType.GuildCategory)
      .sort((a,b) => a.position - b.position)
      .map(c => ({
        id: c.id,
        name: c.name,
        position: c.position,
        children: channels
          .filter(x => x && x.parentId === c.id)
          .sort((a,b) => a.position - b.position)
          .map(x => ({ id: x.id, name: x.name, type: x.type }))
      }));

    const uncategorized = channels
      .filter(c => c && !c.parentId && c.type !== ChannelType.GuildCategory)
      .sort((a,b) => a.position - b.position)
      .map(c => ({ id: c.id, name: c.name, type: c.type }));

    res.json({ guild: { id: guild.id, name: guild.name }, categories, uncategorized });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Não foi possível ler o servidor. Verifique se o bot está instalado." });
  }
});

app.post("/api/guild/:guildId/build", requireLogin, async (req, res) => {
  try {
    const { name, categories = [] } = req.body;
    const guild = await client.guilds.fetch(req.params.guildId);

    if (!name || !Array.isArray(categories)) {
      return res.status(400).json({ error: "Estrutura inválida." });
    }

    const created = [];

    for (const category of categories.slice(0, 25)) {
      if (!category.name) continue;

      const createdCategory = await guild.channels.create({
        name: String(category.name).slice(0, 100),
        type: ChannelType.GuildCategory
      });

      created.push({ type: "category", name: createdCategory.name });

      for (const channel of (category.channels || []).slice(0, 25)) {
        if (!channel.name) continue;

        const createdChannel = await guild.channels.create({
          name: String(channel.name).toLowerCase().replace(/[^a-z0-9áéíóúãõç\-]/gi, "-").slice(0, 100),
          type: channel.type === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText,
          parent: createdCategory.id
        });

        created.push({ type: "channel", name: createdChannel.name });
      }
    }

    const configs = readConfigs();
    configs[guild.id] = {
      name,
      updatedAt: new Date().toISOString(),
      structure: categories
    };
    writeConfigs(configs);

    res.json({ ok: true, created });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Falha ao aplicar a estrutura.",
      details: error.message
    });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

app.use(express.static(path.join(process.cwd(), "public")));

client.once("ready", () => {
  console.log(`NEXUS conectado como ${client.user.tag}`);
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(error => {
  console.error("Não foi possível iniciar o bot:", error.message);
});

app.listen(PORT, () => {
  console.log(`NEXUS web: http://localhost:${PORT}`);
});
