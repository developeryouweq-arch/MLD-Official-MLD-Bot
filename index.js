const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ThreadAutoArchiveDuration
} = require('discord.js');
const fs = require('fs');

// ─── Config ────────────────────────────────────────────────────────────────────
const LEAGUE_CHANNEL_ID   = '1483021640504709202';
const LEAGUE_HOST_ROLE_ID = '1483021638693032032';
const LEAGUES_PING_ROLE   = '1483021638185254921';

// Bad words ONLY — no link detection, no other filters
const BAD_WORDS = [
    'nigga', 'nigger', 'fuck', 'f*ck', 'fuk', 'fvck',
    'shit', 'sh1t', 'bitch', 'b1tch', 'cunt', 'c*nt',
    'faggot', 'fag', 'f*g', 'retard', 'slut', 'sl*t',
    'whore', 'wh*re', 'bastard', 'motherfucker', 'cock',
    'dick', 'pussy', 'asshole', 'a**hole'
];

// ─── Database ──────────────────────────────────────────────────────────────────
const DB_PATH = './database.json';

function loadDB() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            const fresh = { leagues: {}, warnings: {}, bans: {} };
            fs.writeFileSync(DB_PATH, JSON.stringify(fresh, null, 2));
            return fresh;
        }
        const raw  = fs.readFileSync(DB_PATH, 'utf8');
        const data = JSON.parse(raw);
        if (!data.leagues)  data.leagues  = {};
        if (!data.warnings) data.warnings = {};
        if (!data.bans)     data.bans     = {};
        return data;
    } catch (e) {
        console.error('Database read error:', e);
        return { leagues: {}, warnings: {}, bans: {} };
    }
}

function saveDB(db) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    } catch (e) {
        console.error('Database write error:', e);
    }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function generateLeagueId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function maxPlayers(format) {
    return { '2v2': 4, '3v3': 6, '4v4': 8 }[format] || 4;
}

function displayType(type) {
    return { swift_game: 'Swift Game', war_game: 'War Game' }[type] || type;
}

function displayPerks(perks) {
    return perks === 'perks' ? 'Perks' : 'No Perks';
}

function displayRegion(region) {
    return {
        europe:        'Europe',
        asia:          'Asia',
        north_america: 'North America',
        south_america: 'South America',
        oceania:       'Oceania'
    }[region] || region;
}

function buildLeagueEmbed(league, full = false) {
    const spots      = league.maxPlayers - league.players.length;
    const playerList = league.players.map(p => `<@${p}>`).join('\n') || 'None';

    const embed = new EmbedBuilder()
        .setColor(full ? 0x2e2e2e : 0x1a1a2e)
        .setTitle(full ? `LEAGUE ${league.id}  —  CLOSED` : `LEAGUE ${league.id}  —  OPEN`)
        .setDescription(
            full
                ? 'This league is full. Participants have been moved to a private thread.'
                : `Press the button below to join this league.`
        )
        .addFields(
            { name: 'GAME TYPE',  value: displayType(league.type),              inline: true },
            { name: 'FORMAT',     value: league.format.toUpperCase(),            inline: true },
            { name: 'PERKS',      value: displayPerks(league.perks),             inline: true },
            { name: 'REGION',     value: displayRegion(league.region),           inline: true },
            { name: 'HOST',       value: `<@${league.hostId}>`,                  inline: true },
            { name: 'SPOTS LEFT', value: `${spots} / ${league.maxPlayers}`,      inline: true },
            { name: 'PLAYERS',    value: playerList,                             inline: false },
            { name: 'LEAGUE ID',  value: `\`${league.id}\``,                    inline: true }
        )
        .setFooter({ text: full ? 'League is now closed.' : `Cancel: /league cancel id:${league.id}` })
        .setTimestamp();

    return embed;
}

function buildJoinRow(leagueId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`league_join_${leagueId}`)
            .setLabel(disabled ? 'LEAGUE FULL' : 'JOIN LEAGUE')
            .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
            .setDisabled(disabled)
    );
}

// ─── Client ────────────────────────────────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ─── Ready ─────────────────────────────────────────────────────────────────────
client.once('ready', async () => {
    console.log(`Online as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('league')
            .setDescription('League management')
            .addSubcommand(sub =>
                sub.setName('host')
                    .setDescription('Host a new league')
                    .addStringOption(o =>
                        o.setName('format').setDescription('Match format').setRequired(true)
                            .addChoices(
                                { name: '2v2', value: '2v2' },
                                { name: '3v3', value: '3v3' },
                                { name: '4v4', value: '4v4' }
                            ))
                    .addStringOption(o =>
                        o.setName('type').setDescription('Match type').setRequired(true)
                            .addChoices(
                                { name: 'Swift Game', value: 'swift_game' },
                                { name: 'War Game',   value: 'war_game'   }
                            ))
                    .addStringOption(o =>
                        o.setName('perks').setDescription('Match perks').setRequired(true)
                            .addChoices(
                                { name: 'Perks',    value: 'perks'    },
                                { name: 'No Perks', value: 'no_perks' }
                            ))
                    .addStringOption(o =>
                        o.setName('region').setDescription('Region').setRequired(true)
                            .addChoices(
                                { name: 'Europe',        value: 'europe'        },
                                { name: 'Asia',          value: 'asia'          },
                                { name: 'North America', value: 'north_america' },
                                { name: 'South America', value: 'south_america' },
                                { name: 'Oceania',       value: 'oceania'       }
                            ))
            )
            .addSubcommand(sub =>
                sub.setName('cancel')
                    .setDescription('Cancel an active league')
                    .addStringOption(o =>
                        o.setName('id').setDescription('League ID').setRequired(true)
                    ))
    ];

    try {
        await client.application.commands.set(commands);
        console.log('Slash commands registered.');
    } catch (err) {
        console.error('Command registration failed:', err);
    }

    // ── Timed-ban expiry check every 10 minutes ─────────────────────────────────
    setInterval(async () => {
        const db  = loadDB();
        const now = Date.now();
        let changed = false;

        for (const [userId, expiry] of Object.entries(db.bans)) {
            if (now >= expiry) {
                for (const guild of client.guilds.cache.values()) {
                    try {
                        await guild.members.unban(userId, 'Automod: 3-day temp-ban expired');
                        console.log(`Unbanned ${userId} in ${guild.name}`);
                    } catch (_) {}
                }
                delete db.bans[userId];
                delete db.warnings[userId];
                changed = true;
            }
        }

        if (changed) saveDB(db);
    }, 10 * 60 * 1000);
});

// ─── Slash command interactions ────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {

    // ── BUTTON: Join League ──────────────────────────────────────────────────────
    if (interaction.isButton()) {
        if (!interaction.customId.startsWith('league_join_')) return;

        await interaction.deferReply({ ephemeral: true });

        const leagueId = interaction.customId.replace('league_join_', '');
        const db       = loadDB();
        const league   = db.leagues[leagueId];

        if (!league)                                        return interaction.editReply('This league no longer exists.');
        if (league.status !== 'open')                       return interaction.editReply('This league is no longer accepting players.');
        if (league.players.includes(interaction.user.id))  return interaction.editReply('You are already in this league.');
        if (league.players.length >= league.maxPlayers)    return interaction.editReply('This league is full.');

        league.players.push(interaction.user.id);

        // ── League is now full — open the private thread ─────────────────────────
        if (league.players.length >= league.maxPlayers) {
            league.status = 'full';

            try {
                const leagueChannel = await interaction.guild.channels.fetch(league.channelId);

                // Create the private thread
                const thread = await leagueChannel.threads.create({
                    name:                `League ${leagueId} — ${displayType(league.type)}`,
                    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
                    type:                ChannelType.PrivateThread,
                    invitable:           false,
                    reason:              `League ${leagueId} is full — starting`
                });

                league.threadId = thread.id;
                saveDB(db);

                // Add every participant to the private thread
                for (const playerId of league.players) {
                    try { await thread.members.add(playerId); } catch (_) {}
                }

                const playerMentions = league.players.map(p => `<@${p}>`).join('\n');

                const startEmbed = new EmbedBuilder()
                    .setColor(0x1a1a2e)
                    .setTitle(`LEAGUE ${leagueId}  —  ACTIVE`)
                    .setDescription(
                        'The league is now full. Only participants can see this thread.\n' +
                        'Coordinate your match here. Good luck.'
                    )
                    .addFields(
                        { name: 'GAME TYPE', value: displayType(league.type),     inline: true },
                        { name: 'FORMAT',    value: league.format.toUpperCase(),  inline: true },
                        { name: 'PERKS',     value: displayPerks(league.perks),   inline: true },
                        { name: 'REGION',    value: displayRegion(league.region), inline: true },
                        { name: 'HOST',      value: `<@${league.hostId}>`,        inline: true },
                        { name: '\u200b',    value: '\u200b',                     inline: true },
                        { name: 'PLAYERS',   value: playerMentions,               inline: false }
                    )
                    .setTimestamp();

                await thread.send({
                    content: league.players.map(p => `<@${p}>`).join(' '),
                    embeds:  [startEmbed]
                });

                console.log(`Private thread created for league ${leagueId}: ${thread.id}`);
            } catch (e) {
                console.error('Thread creation failed:', e);
            }

            // Update the public embed — disable the button
            try {
                const ch  = await interaction.guild.channels.fetch(league.channelId);
                const msg = await ch.messages.fetch(league.messageId);
                if (msg) {
                    await msg.edit({
                        embeds:     [buildLeagueEmbed(league, true)],
                        components: [buildJoinRow(leagueId, true)]
                    });
                }
            } catch (_) {}

            saveDB(db);
            return interaction.editReply('You have joined the league. The league is now full — check the private thread that has been opened for you.');
        }

        // ── Not full yet — update embed with new player count ────────────────────
        saveDB(db);

        try {
            const ch  = await interaction.guild.channels.fetch(league.channelId);
            const msg = await ch.messages.fetch(league.messageId);
            if (msg) {
                await msg.edit({
                    embeds:     [buildLeagueEmbed(league)],
                    components: [buildJoinRow(leagueId)]
                });
            }
        } catch (_) {}

        return interaction.editReply(`You have joined league \`${leagueId}\`. ${league.maxPlayers - league.players.length} spot(s) remaining.`);
    }

    // ── SLASH COMMANDS ───────────────────────────────────────────────────────────
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'league') return;

    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const db  = loadDB();

    // ── HOST ─────────────────────────────────────────────────────────────────────
    if (sub === 'host') {
        if (interaction.channelId !== LEAGUE_CHANNEL_ID) {
            return interaction.editReply('Leagues can only be hosted in <#1483021640504709202>.');
        }

        if (!interaction.member.roles.cache.has(LEAGUE_HOST_ROLE_ID)) {
            return interaction.editReply('You need the League Host role to host leagues.');
        }

        const format = interaction.options.getString('format');
        const type   = interaction.options.getString('type');
        const perks  = interaction.options.getString('perks');
        const region = interaction.options.getString('region');
        const id     = generateLeagueId();
        const max    = maxPlayers(format);

        db.leagues[id] = {
            id,
            format,
            type,
            perks,
            region,
            hostId:     interaction.user.id,
            players:    [interaction.user.id],
            maxPlayers: max,
            channelId:  interaction.channelId,
            guildId:    interaction.guildId,
            messageId:  null,
            threadId:   null,
            status:     'open',
            createdAt:  Date.now()
        };

        saveDB(db);

        const league = db.leagues[id];

        const posted = await interaction.channel.send({
            content:    `<@&${LEAGUES_PING_ROLE}>`,
            embeds:     [buildLeagueEmbed(league)],
            components: [buildJoinRow(id)]
        });

        db.leagues[id].messageId = posted.id;
        saveDB(db);

        return interaction.editReply(`League \`${id}\` has been created. Members can now join using the button on the post.`);
    }

    // ── CANCEL ───────────────────────────────────────────────────────────────────
    if (sub === 'cancel') {
        const id     = interaction.options.getString('id').toUpperCase();
        const league = db.leagues[id];

        if (!league) {
            return interaction.editReply(`No active league found with ID \`${id}\`.`);
        }

        const isHost      = league.hostId === interaction.user.id;
        const hasHostRole = interaction.member.roles.cache.has(LEAGUE_HOST_ROLE_ID);

        if (!isHost && !hasHostRole) {
            return interaction.editReply('You do not have permission to cancel this league.');
        }

        // Delete private thread if it exists
        if (league.threadId) {
            try {
                const thread = await interaction.guild.channels.fetch(league.threadId);
                if (thread) await thread.delete('League cancelled');
            } catch (_) {}
        }

        // Delete the public embed
        if (league.messageId) {
            try {
                const ch  = await interaction.guild.channels.fetch(league.channelId);
                const msg = await ch.messages.fetch(league.messageId);
                if (msg) await msg.delete();
            } catch (_) {}
        }

        delete db.leagues[id];
        saveDB(db);

        return interaction.editReply(`League \`${id}\` has been cancelled and removed.`);
    }
});

// ─── Automod — bad words only ──────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild)     return;
    if (!message.member)    return;

    // Strip markdown formatting characters, then check for bad words only
    const content   = message.content.toLowerCase().replace(/[*_~`|\\]/g, '');
    const triggered = BAD_WORDS.some(word => content.includes(word));

    if (!triggered) return;

    // Delete the offending message
    try { await message.delete(); } catch (_) {}

    const db     = loadDB();
    const userId = message.author.id;

    if (!db.warnings[userId]) db.warnings[userId] = 0;
    db.warnings[userId]++;
    const total = db.warnings[userId];
    saveDB(db);

    // Warning notice — auto-deletes after 8 seconds
    const warnEmbed = new EmbedBuilder()
        .setColor(0x1a1a2e)
        .setTitle('AUTOMOD  —  WARNING ISSUED')
        .setDescription(`${message.author} — your message contained prohibited language and has been removed.`)
        .addFields(
            { name: 'WARNINGS',       value: `${total}`,  inline: true },
            { name: 'KICK AT',        value: '10',         inline: true },
            { name: 'BAN AT',         value: '30',         inline: true }
        )
        .setTimestamp();

    const notice = await message.channel.send({ embeds: [warnEmbed] }).catch(() => null);
    if (notice) setTimeout(() => notice.delete().catch(() => {}), 8000);

    // ── 10 warnings → kick ───────────────────────────────────────────────────────
    if (total === 10) {
        try {
            await message.member.send(
                'You have been kicked from the server for accumulating 10 warnings for prohibited language. ' +
                'You may rejoin, but further violations will result in a ban.'
            ).catch(() => {});

            await message.member.kick('Automod: 10 warnings');

            const kickEmbed = new EmbedBuilder()
                .setColor(0x1a1a2e)
                .setTitle('AUTOMOD  —  MEMBER KICKED')
                .setDescription(`**${message.author.tag}** was kicked for accumulating 10 warnings.`)
                .setTimestamp();

            await message.channel.send({ embeds: [kickEmbed] });
        } catch (e) {
            console.error('Kick failed:', e);
        }
    }

    // ── 30 warnings → 3-day ban ──────────────────────────────────────────────────
    if (total >= 30) {
        try {
            const expiresAt = Date.now() + 3 * 24 * 60 * 60 * 1000;
            db.bans[userId] = expiresAt;
            saveDB(db);

            await message.member.send(
                'You have been banned from the server for 3 days for accumulating 30 warnings for prohibited language.'
            ).catch(() => {});

            await message.member.ban({ reason: 'Automod: 30 warnings — 3-day ban', deleteMessageSeconds: 0 });

            const banEmbed = new EmbedBuilder()
                .setColor(0x1a1a2e)
                .setTitle('AUTOMOD  —  MEMBER BANNED (3 DAYS)')
                .setDescription(`**${message.author.tag}** has been banned for 3 days for accumulating 30 warnings.`)
                .setTimestamp();

            await message.channel.send({ embeds: [banEmbed] });
        } catch (e) {
            console.error('Ban failed:', e);
        }
    }
});

// ─── Login ─────────────────────────────────────────────────────────────────────
const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
    console.error('DISCORD_TOKEN is not set.');
    process.exit(1);
}

client.login(TOKEN).catch(err => {
    console.error('Login failed:', err);
    process.exit(1);
});
