class GuildPlugin {
  constructor(bot, db, gameEngine) {
    this.bot = bot;
    this.db = db;
    this.gameEngine = gameEngine;
    this.playerStates = new Map(); // For multi-step actions, e.g., { userId: 'awaiting_guild_name' }

    this.commands = {
      'guild': this.handleGuild.bind(this),
    };
    
    // This new handler will process non-command text messages
    this.textHandler = this.handleTextMessage.bind(this);
  }

  async init() {
    console.log('Interactive Guild plugin initialized');
  }

  // --- MENU DISPLAY FUNCTIONS ---

  async handleGuild(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) {
        await this.bot.sendMessage(msg.chat.id, "❌ You don't have a character!");
        return;
    }

    const guildId = character.guild;
    const guild = guildId ? this.db.getGuild(guildId) : null;

    if (guild) {
      await this.showGuildMenu(msg.chat.id, userId, guild);
    } else {
      await this.showNoGuildMenu(msg.chat.id);
    }
  }

  async showGuildMenu(chatId, userId, guild) {
    const isLeader = guild.leader === userId;
    const leaderChar = this.gameEngine.getCharacter(guild.leader);
    const leaderName = leaderChar ? leaderChar.name : 'Unknown';

    let keyboard = [
        [{ text: '👥 View Members', callback_data: 'guild_members_view' }],
        [{ text: '💬 Send Guild Chat', callback_data: 'guild_chat_prompt' }],
        isLeader ? { text: '➕ Invite Member', callback_data: 'guild_invite_prompt' } : null,
        isLeader ? { text: '⚙️ Settings', callback_data: 'guild_settings_menu' } : null,
        isLeader ? { text: '❌ Disband Guild', callback_data: 'guild_disband_confirm' } : { text: '👋 Leave Guild', callback_data: 'guild_leave_confirm' }
    ].filter(Boolean).map(btn => Array.isArray(btn) ? btn : [btn]);

    const message = `
🏛️ *Guild: ${guild.name}* [Lvl. ${guild.level}]

👑 *Leader:* ${leaderName}
👥 *Members:* ${guild.members.length}
💰 *Treasury:* ${guild.treasury} Zeny

> ${guild.description || 'A guild ready for adventure.'}
    `;

    await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    });
  }

  async showNoGuildMenu(chatId) {
    const keyboard = {
        inline_keyboard: [
            [{ text: '➕ Create a Guild', callback_data: 'guild_create_prompt' }],
            [{ text: '📜 Browse All Guilds', callback_data: 'guild_list_browse' }]
        ]
    };

    const message = `
🏛️ *Guild Hall*

You are not yet part of a guild. A guild allows you to team up for exclusive quests, access a private chat, and participate in guild events.

What would you like to do?
    `;

    await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
  }

  // --- TEXT MESSAGE HANDLER (for multi-step interactions) ---

  async handleTextMessage(msg) {
    const userId = msg.from.id;
    const state = this.playerStates.get(userId);

    if (!state) return; // Not waiting for any input

    this.playerStates.delete(userId); // Consume the state

    if (state === 'awaiting_guild_name') {
      await this._createGuild(msg, msg.text);
    } else if (state === 'awaiting_invitee_id') {
      await this._inviteMember(msg, msg.text);
    } else if (state === 'awaiting_chat_message') {
      await this._sendGuildChat(msg, msg.text);
    }
  }

  // --- CALLBACK QUERY HANDLER ---

  async handleCallback(callbackQuery) {
    const userId = callbackQuery.from.id;
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    await this.bot.answerCallbackQuery(callbackQuery.id);

    const character = this.gameEngine.getCharacter(userId);
    if (!character) {
        await this.bot.sendMessage(chatId, "❌ You need a character to interact with guilds.");
        return;
    }
    const guild = character.guild ? this.db.getGuild(character.guild) : null;

    switch (data) {
      case 'guild_create_prompt':
        this.playerStates.set(userId, 'awaiting_guild_name');
        await this.bot.sendMessage(chatId, '📝 Please type the desired name for your new guild. (Cost: 10,000 Zeny)');
        break;

      case 'guild_list_browse':
        await this._listGuilds(chatId);
        break;

      case 'guild_members_view':
        if (guild) await this._listMembers(chatId, guild);
        break;
      
      case 'guild_chat_prompt':
        this.playerStates.set(userId, 'awaiting_chat_message');
        await this.bot.sendMessage(chatId, '💬 Type the message you want to send to your guild.');
        break;

      case 'guild_invite_prompt':
        this.playerStates.set(userId, 'awaiting_invitee_id');
        await this.bot.sendMessage(chatId, '👤 Please enter the Character ID of the player you want to invite.');
        break;

      case 'guild_leave_confirm':
        await this.bot.sendMessage(chatId, 'Are you sure you want to leave the guild?', {
          reply_markup: { inline_keyboard: [[{ text: '✅ Yes, I want to leave', callback_data: 'guild_leave_execute' }, { text: '❌ Cancel', callback_data: 'guild_menu_show' }]] }
        });
        break;

      case 'guild_leave_execute':
        await this._leaveGuild(chatId, userId);
        break;
      
      case 'guild_menu_show':
        if (guild) await this.showGuildMenu(chatId, userId, guild);
        else await this.showNoGuildMenu(chatId);
        break;
    }
  }

  // --- INTERNAL LOGIC FUNCTIONS (_private) ---

  async _createGuild(msg, guildName) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (character.guild) {
      return this.bot.sendMessage(msg.chat.id, '❌ You are already in a guild!');
    }
    if (guildName.length < 3 || guildName.length > 30) {
      return this.bot.sendMessage(msg.chat.id, '❌ Guild name must be 3-30 characters long.');
    }
    const cost = 10000;
    if (character.inventory.zeny < cost) {
      return this.bot.sendMessage(msg.chat.id, `❌ You need ${cost} Zeny to create a guild.`);
    }

    // Check if guild name is taken
    const allGuilds = this.db.getAllGuilds() || [];
    if (allGuilds.some(g => g.name.toLowerCase() === guildName.toLowerCase())) {
        return this.bot.sendMessage(msg.chat.id, `❌ A guild with the name "${guildName}" already exists.`);
    }

    const { randomUUID } = require('crypto');
    const guildId = `guild_${randomUUID().slice(0, 8)}`;
    
    const newGuild = {
      id: guildId,
      name: guildName,
      leader: userId,
      members: [userId],
      created: Date.now(),
      level: 1,
      exp: 0,
      treasury: 0,
      description: `${guildName} - A new guild.`,
      settings: { publicJoin: false, minLevel: 1 }
    };

    character.inventory.zeny -= cost;
    character.guild = guildId;
    
    this.db.setGuild(guildId, newGuild);
    this.gameEngine.updateCharacter(userId, character);

    await this.bot.sendMessage(msg.chat.id, `🎉 Guild *${guildName}* has been created!`);
    await this.showGuildMenu(msg.chat.id, userId, newGuild);
  }

  async _leaveGuild(chatId, userId) {
    const character = this.gameEngine.getCharacter(userId);
    const guild = character.guild ? this.db.getGuild(character.guild) : null;

    if (!guild) {
      return this.bot.sendMessage(chatId, '❌ You are not in a guild.');
    }
    if (guild.leader === userId) {
      return this.bot.sendMessage(chatId, '❌ Leaders cannot leave. Disband the guild or transfer leadership first.');
    }

    guild.members = guild.members.filter(id => id !== userId);
    character.guild = null;
    
    this.db.setGuild(guild.id, guild);
    this.gameEngine.updateCharacter(userId, character);

    await this.bot.sendMessage(chatId, `You have successfully left *${guild.name}*.`);
    await this.notifyGuildMembers(guild, `👋 ${character.name} has left the guild.`);
  }

  async _listMembers(chatId, guild) {
    let membersText = `*${guild.name} - Members*\n\n`;
    for (const memberId of guild.members) {
      const memberChar = this.gameEngine.getCharacter(memberId);
      if (memberChar) {
        const role = memberId === guild.leader ? '👑' : '👤';
        membersText += `${role} ${memberChar.name} - Lvl. ${memberChar.level} ${memberChar.class}\n`;
      }
    }
    await this.bot.sendMessage(chatId, membersText, { parse_mode: 'Markdown' });
  }
  
  async _listGuilds(chatId) {
      const guilds = this.db.getAllGuilds() || [];
      if (guilds.length === 0) {
        return this.bot.sendMessage(chatId, '📋 There are no guilds yet. Why not create one?');
      }

      let guildList = '📋 *List of All Guilds*\n\n';
      for (const guild of guilds) {
        const leader = this.gameEngine.getCharacter(guild.leader);
        guildList += `🏛️ *${guild.name}* (Lvl. ${guild.level})\n`;
        guildList += `  Leader: ${leader ? leader.name : '-'}\n`;
        guildList += `  Members: ${guild.members.length}\n\n`;
      }
      await this.bot.sendMessage(chatId, guildList, { parse_mode: 'Markdown' });
  }

  async _sendGuildChat(msg, message) {
      const userId = msg.from.id;
      const character = this.gameEngine.getCharacter(userId);
      const guild = character.guild ? this.db.getGuild(character.guild) : null;

      if (!guild) {
          return this.bot.sendMessage(msg.chat.id, "❌ You're not in a guild.");
      }
      if (!message) return;

      const chatMessage = `[${guild.name}] ${character.name}: ${message}`;
      await this.notifyGuildMembers(guild, chatMessage, userId);
      await this.bot.sendMessage(msg.chat.id, "✅ Your message has been sent to the guild.");
  }

  async _inviteMember(msg, targetId) {
      // This is a placeholder for invite logic
      // It would involve creating an invitation in the DB for the target
      await this.bot.sendMessage(msg.chat.id, `✅ Invitation sent to character ID ${targetId}. (Feature in development)`);
  }

  async notifyGuildMembers(guild, message, excludeId = null) {
    for (const memberId of guild.members) {
      if (memberId === excludeId) continue;
      try {
        await this.bot.sendMessage(memberId, message, { parse_mode: 'Markdown' });
      } catch (error) {
        console.log(`Failed to send message to guild member ${memberId}: ${error.message}`);
      }
    }
  }
}

module.exports = GuildPlugin;
