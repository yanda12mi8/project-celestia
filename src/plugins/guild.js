class GuildPlugin {
  constructor(bot, db, gameEngine) {
    this.bot = bot;
    this.db = db;
    this.gameEngine = gameEngine;
    
    this.commands = {
      'guild': this.handleGuild,
      'gcreate': this.handleCreateGuild,
      'gjoin': this.handleJoinGuild,
      'gleave': this.handleLeaveGuild,
      'gkick': this.handleKickMember,
      'gmembers': this.handleGuildMembers,
      'gchat': this.handleGuildChat
    };
  }

  async init() {
    console.log('Guild plugin initialized');
  }

  async handleGuild(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    if (character.guild) {
      const guild = this.db.getGuild(character.guild);
      if (guild) {
        await this.showGuildInfo(msg.chat.id, guild);
      } else {
        await this.bot.sendMessage(msg.chat.id,
          `❌ Guild not found! Your guild may have been disbanded.`
        );
      }
    } else {
      const keyboard = {
        inline_keyboard: [
          [
            { text: '🏛️ Create Guild', callback_data: 'create_guild' },
            { text: '🔍 Find Guild', callback_data: 'find_guild' }
          ],
          [
            { text: '📋 Guild List', callback_data: 'guild_list' }
          ]
        ]
      };

      await this.bot.sendMessage(msg.chat.id,
        `🏛️ *Guild System*\n\n` +
        `You're not in a guild yet!\n\n` +
        `🎯 *Benefits of joining a guild:*\n` +
        `• Chat with guild members\n` +
        `• Group activities and raids\n` +
        `• Shared resources and support\n` +
        `• Guild exclusive quests\n\n` +
        `What would you like to do?`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    }
  }

  async handleCreateGuild(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    if (character.guild) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You're already in a guild! Leave your current guild first.`
      );
      return;
    }

    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Please provide a guild name!\n\n` +
        `Usage: /gcreate <guild_name>\n` +
        `Example: /gcreate MyGuild\n\n` +
        `💰 Cost: 10,000 Zeny`
      );
      return;
    }

    const guildName = args.join(' ');
    const { randomUUID } = require('crypto');
    const guildId = `guild_${randomUUID().slice(0, 8)}`;
    
    if (guildName.length < 3 || guildName.length > 30) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Guild name must be between 3 and 30 characters!`
      );
      return;
    }

    if (this.db.getGuild(guildId)) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ A guild with this name already exists!`
      );
      return;
    }

    const cost = 10000;
    if (character.inventory.zeny < cost) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You need ${cost} Zeny to create a guild!\n` +
        `You have: ${character.inventory.zeny} Zeny`
      );
      return;
    }

    // Create guild
    const guild = {
      id: guildId,
      name: guildName,
      leader: userId,
      members: [userId],
      created: Date.now(),
      level: 1,
      exp: 0,
      treasury: 0,
      description: `${guildName} - A new guild ready for adventure!`,
      announcements: [],
      settings: {
        publicJoin: false,
        minLevel: 1
      }
    };

    // Deduct zeny and update character
    character.inventory.zeny -= cost;
    character.guild = guildId;
    
    this.db.setGuild(guildId, guild);
    this.gameEngine.updateCharacter(userId, character);

    await this.bot.sendMessage(msg.chat.id,
      `🎉 *Guild Created Successfully!*\n\n` +
      `🏛️ Guild Name: ${guildName}\n` +
      `👑 Leader: ${character.name}\n` +
      `📊 Level: ${guild.level}\n` +
      `💰 Cost: ${cost} Zeny\n\n` +
      `Welcome to your new guild! Use /guild to manage it.`,
      { parse_mode: 'Markdown' }
    );
  }

  async handleJoinGuild(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    if (character.guild) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You're already in a guild! Leave your current guild first.`
      );
      return;
    }

    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Please provide a guild name!\n\n` +
        `Usage: /gjoin <guild_name>\n` +
        `Example: /gjoin MyGuild`
      );
      return;
    }

    const guildName = args.join(' ');
    const guildId = guildName.toLowerCase().replace(/\s+/g, '_');
    const guild = this.db.getGuild(guildId);

    if (!guild) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Guild "${guildName}" not found!`
      );
      return;
    }

    if (character.level < guild.settings.minLevel) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You need to be at least level ${guild.settings.minLevel} to join this guild!`
      );
      return;
    }

    if (guild.members.includes(userId)) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You're already a member of this guild!`
      );
      return;
    }

    if (!guild.settings.publicJoin) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ This guild requires an invitation to join!`
      );
      return;
    }

    // Join guild
    guild.members.push(userId);
    character.guild = guildId;

    this.db.setGuild(guildId, guild);
    this.gameEngine.updateCharacter(userId, character);

    await this.bot.sendMessage(msg.chat.id,
      `🎉 *Joined Guild Successfully!*\n\n` +
      `🏛️ Guild: ${guild.name}\n` +
      `👥 Members: ${guild.members.length}\n` +
      `📊 Level: ${guild.level}\n\n` +
      `Welcome to the guild! Use /guild to see guild information.`,
      { parse_mode: 'Markdown' }
    );

    // Notify guild members
    await this.notifyGuildMembers(guild, `🎉 ${character.name} has joined the guild!`);
  }

  async handleLeaveGuild(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character || !character.guild) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You're not in a guild!`
      );
      return;
    }

    const guild = this.db.getGuild(character.guild);
    if (!guild) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Guild not found!`
      );
      return;
    }

    if (guild.leader === userId) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Guild leaders cannot leave! Transfer leadership first or disband the guild.`
      );
      return;
    }

    // Remove from guild
    guild.members = guild.members.filter(id => id !== userId);
    character.guild = null;

    this.db.setGuild(guild.id, guild);
    this.gameEngine.updateCharacter(userId, character);

    await this.bot.sendMessage(msg.chat.id,
      `✅ *Left Guild Successfully!*\n\n` +
      `You have left ${guild.name}.\n` +
      `You can join another guild anytime!`
    );

    // Notify remaining guild members
    await this.notifyGuildMembers(guild, `👋 ${character.name} has left the guild.`);
  }

  async handleGuildMembers(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character || !character.guild) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You're not in a guild!`
      );
      return;
    }

    const guild = this.db.getGuild(character.guild);
    if (!guild) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Guild not found!`
      );
      return;
    }

    let membersText = `👥 *${guild.name} Members*\n\n`;
    
    for (const memberId of guild.members) {
      const memberChar = this.gameEngine.getCharacter(memberId);
      if (memberChar) {
        const role = memberId === guild.leader ? '👑 Leader' : '👤 Member';
        membersText += `${role} ${memberChar.name} (Level ${memberChar.level})\n`;
      }
    }

    await this.bot.sendMessage(msg.chat.id, membersText, { parse_mode: 'Markdown' });
  }

  async handleGuildChat(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character || !character.guild) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You're not in a guild!`
      );
      return;
    }

    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Please provide a message!\n\n` +
        `Usage: /gchat <message>\n` +
        `Example: /gchat Hello everyone!`
      );
      return;
    }

    const message = args.join(' ');
    const guild = this.db.getGuild(character.guild);
    
    if (!guild) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Guild not found!`
      );
      return;
    }

    const guildMessage = `🏛️ *Guild Chat*\n👤 ${character.name}: ${message}`;
    await this.notifyGuildMembers(guild, guildMessage);
  }

  async showGuildInfo(chatId, guild) {
    const leader = this.gameEngine.getCharacter(guild.leader);
    const leaderName = leader ? leader.name : 'Unknown';

    const keyboard = {
      inline_keyboard: [
        [
          { text: '👥 Members', callback_data: 'guild_members' },
          { text: '💰 Treasury', callback_data: 'guild_treasury' }
        ],
        [
          { text: '📢 Announcements', callback_data: 'guild_announcements' },
          { text: '⚙️ Settings', callback_data: 'guild_settings' }
        ],
        [
          { text: '👋 Leave Guild', callback_data: 'leave_guild' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId,
      `🏛️ *${guild.name}*\n\n` +
      `👑 Leader: ${leaderName}\n` +
      `👥 Members: ${guild.members.length}\n` +
      `📊 Level: ${guild.level}\n` +
      `✨ EXP: ${guild.exp}\n` +
      `💰 Treasury: ${guild.treasury} Zeny\n` +
      `📅 Created: ${new Date(guild.created).toLocaleDateString()}\n\n` +
      `📝 Description:\n${guild.description}`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  }

  async notifyGuildMembers(guild, message) {
    for (const memberId of guild.members) {
      try {
        await this.bot.sendMessage(memberId, message, { parse_mode: 'Markdown' });
      } catch (error) {
        // Member might have blocked the bot or deleted account
        console.log(`Failed to send message to guild member ${memberId}`);
      }
    }
  }

  async handleCallback(callbackQuery) {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (data === 'create_guild') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.bot.sendMessage(callbackQuery.message.chat.id,
        `🏛️ *Create Guild*\n\n` +
        `To create a guild, use the command:\n` +
        `/gcreate <guild_name>\n\n` +
        `💰 Cost: 10,000 Zeny\n` +
        `📝 Name: 3-30 characters\n\n` +
        `Example: /gcreate MyGuild`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    if (data === 'find_guild') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.bot.sendMessage(callbackQuery.message.chat.id,
        `🔍 *Find Guild*\n\n` +
        `To join a guild, use the command:\n` +
        `/gjoin <guild_name>\n\n` +
        `Example: /gjoin MyGuild\n\n` +
        `Or use /guild to see the guild list!`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    if (data === 'guild_list') {
      const guilds = Array.from(this.db.guilds.values());
      
      if (guilds.length === 0) {
        await this.bot.answerCallbackQuery(callbackQuery.id);
        await this.bot.sendMessage(callbackQuery.message.chat.id,
          `📋 *Guild List*\n\nNo guilds have been created yet!\nBe the first to create one with /gcreate!`
        );
        return true;
      }

      let guildList = `📋 *Guild List*\n\n`;
      for (const guild of guilds) {
        const leader = this.gameEngine.getCharacter(guild.leader);
        const leaderName = leader ? leader.name : 'Unknown';
        
        guildList += `🏛️ **${guild.name}**\n`;
        guildList += `   👑 Leader: ${leaderName}\n`;
        guildList += `   👥 Members: ${guild.members.length}\n`;
        guildList += `   📊 Level: ${guild.level}\n`;
        guildList += `   ${guild.settings.publicJoin ? '🟢 Open' : '🔴 Closed'}\n\n`;
      }

      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.bot.sendMessage(callbackQuery.message.chat.id, guildList, { parse_mode: 'Markdown' });
      return true;
    }

    if (data === 'guild_members') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.handleGuildMembers({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      return true;
    }

    if (data === 'leave_guild') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.handleLeaveGuild({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      return true;
    }

    return false;
  }
}

module.exports = GuildPlugin;