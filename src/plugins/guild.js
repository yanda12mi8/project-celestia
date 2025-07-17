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
            [{ text: '✉️ View Invitations', callback_data: 'guild_invites_view' }],
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
    } else if (state === 'awaiting_guild_description') {
      await this._setGuildDescription(msg, msg.text);
    } else if (state === 'awaiting_guild_min_level') {
      await this._setGuildMinLevel(msg, msg.text);
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

    if (data.startsWith('accept_guild_invite_')) {
      const guildIdFromInvite = data.substring('accept_guild_invite_'.length);
      await this._acceptGuildInvite(chatId, userId, guildIdFromInvite);
      return true;
    }

    if (data.startsWith('decline_guild_invite_')) {
      const guildIdFromInvite = data.substring('decline_guild_invite_'.length);
      await this._declineGuildInvite(chatId, userId, guildIdFromInvite);
      return true;
    }

    switch (data) {
      case 'guild_create_prompt':
        this.playerStates.set(userId, 'awaiting_guild_name');
        await this.bot.sendMessage(chatId, '📝 Please type the desired name for your new guild. (Cost: 10,000 Zeny)');
        return true;

      case 'guild_list_browse':
        await this._listGuilds(chatId);
        return true;

      case 'guild_invites_view':
        await this._listInvitations(chatId, userId);
        return true;

      case 'guild_members_view':
        if (guild) await this._listMembers(chatId, guild);
        return true;
      
      case 'guild_chat_prompt':
        this.playerStates.set(userId, 'awaiting_chat_message');
        await this.bot.sendMessage(chatId, '💬 Type the message you want to send to your guild.');
        return true;

      case 'guild_invite_prompt':
        this.playerStates.set(userId, 'awaiting_invitee_id');
        await this.bot.sendMessage(chatId, '👤 Please enter the Character ID of the player you want to invite.');
        return true;

      case 'guild_leave_confirm':
        await this.bot.sendMessage(chatId, 'Are you sure you want to leave the guild?', {
          reply_markup: { inline_keyboard: [[{ text: '✅ Yes, I want to leave', callback_data: 'guild_leave_execute' }, { text: '❌ Cancel', callback_data: 'guild_menu_show' }]] }
        });
        return true;

      case 'guild_leave_execute':
        await this._leaveGuild(chatId, userId);
        return true;

      case 'guild_disband_confirm':
        await this.bot.sendMessage(chatId, 'Are you absolutely sure you want to disband your guild? This action cannot be undone.', {
          reply_markup: { inline_keyboard: [[{ text: '✅ Yes, Disband Guild', callback_data: 'guild_disband_execute' }, { text: '❌ Cancel', callback_data: 'guild_menu_show' }]] }
        });
        return true;

      case 'guild_disband_execute':
        await this._disbandGuild(chatId, userId);
        return true;

      case 'guild_settings_menu':
        if (guild && guild.leader === userId) {
          await this._showGuildSettingsMenu(chatId, guild);
        } else {
          await this.bot.sendMessage(chatId, '❌ You are not the guild leader.');
        }
        return true;
      
      case 'guild_menu_show':
        if (guild) await this.showGuildMenu(chatId, userId, guild);
        else await this.showNoGuildMenu(chatId);
        return true;

      case 'guild_setting_description':
        this.playerStates.set(userId, 'awaiting_guild_description');
        await this.bot.sendMessage(chatId, '📝 Please type the new description for your guild.');
        return true;

      case 'guild_setting_public_join':
        if (guild && guild.leader === userId) {
          guild.settings.publicJoin = !guild.settings.publicJoin;
          this.db.setGuild(guild.id, guild);
          await this.bot.sendMessage(chatId, `🚪 Public Join is now ${guild.settings.publicJoin ? 'Enabled' : 'Disabled'}.`);
          await this._showGuildSettingsMenu(chatId, guild);
        } else {
          await this.bot.sendMessage(chatId, '❌ You are not the guild leader.');
        }
        return true;

      case 'guild_setting_min_level':
        this.playerStates.set(userId, 'awaiting_guild_min_level');
        await this.bot.sendMessage(chatId, '⬆️ Please enter the new minimum level required to join your guild.');
        return true;
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
    const allGuilds = Array.from(this.db.getAllGuilds().values());
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
      const guilds = Array.from(this.db.getAllGuilds().values());
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

  async _listInvitations(chatId, userId) {
    const invitations = this.db.getGuildInvitations(userId);
    if (invitations.length === 0) {
      return this.bot.sendMessage(chatId, '✉️ You have no pending guild invitations.');
    }

    for (const invite of invitations) {
      const guild = this.db.getGuild(invite.guildId);
      if (guild) {
        const inviter = this.gameEngine.getCharacter(invite.inviterId);
        let inviteMessage = `✉️ *Your Guild Invitation*\n\n`;
        inviteMessage += `🏛️ *${guild.name}* from ${inviter ? inviter.name : 'Unknown'}\n`;
        inviteMessage += `  Level: ${guild.level}\n`;
        inviteMessage += `  Members: ${guild.members.length}\n`;
        inviteMessage += `  _Expires: ${new Date(invite.expiresAt).toLocaleString()}_\n`;

        const keyboard = {
          inline_keyboard: [
            [{ text: '✅ Accept', callback_data: `accept_guild_invite_${invite.guildId}` }],
            [{ text: '❌ Decline', callback_data: `decline_guild_invite_${invite.guildId}` }]
          ]
        };
        await this.bot.sendMessage(chatId, inviteMessage, { parse_mode: 'Markdown', reply_markup: keyboard });
      }
    }
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

  async _acceptGuildInvite(chatId, userId, guildId) {
    const character = this.gameEngine.getCharacter(userId);
    const guild = this.db.getGuild(guildId);

    if (!character || !guild) {
      return this.bot.sendMessage(chatId, '❌ Guild or character not found.');
    }
    if (character.guild) {
      return this.bot.sendMessage(chatId, '❌ You are already in a guild. Leave it first to accept a new invitation.');
    }

    // Remove invitation
    this.db.deleteGuildInvitation(userId, guildId);

    // Add to guild
    guild.members.push(userId);
    character.guild = guildId;

    this.db.setGuild(guild.id, guild);
    this.gameEngine.updateCharacter(userId, character);

    await this.bot.sendMessage(chatId, `🎉 You have joined *${guild.name}*!`);
    await this.notifyGuildMembers(guild, `🎉 ${character.name} has joined the guild!`, userId);
    await this.showGuildMenu(chatId, userId, guild);
  }

  async _declineGuildInvite(chatId, userId, guildId) {
    const character = this.gameEngine.getCharacter(userId);
    const guild = this.db.getGuild(guildId);

    if (!character || !guild) {
      return this.bot.sendMessage(chatId, '❌ Guild or character not found.');
    }

    // Remove invitation
    this.db.deleteGuildInvitation(userId, guildId);

    await this.bot.sendMessage(chatId, `You have declined the invitation to *${guild.name}*.`);
    await this.showNoGuildMenu(chatId);
  }

  async _showGuildSettingsMenu(chatId, guild) {
    const keyboard = {
      inline_keyboard: [
        [{ text: '📝 Change Description', callback_data: 'guild_setting_description' }],
        [{ text: '🚪 Toggle Public Join', callback_data: 'guild_setting_public_join' }],
        [{ text: '⬆️ Set Min Level', callback_data: 'guild_setting_min_level' }],
        [{ text: '🔙 Back to Guild Menu', callback_data: 'guild_menu_show' }]
      ]
    };

    const publicJoinStatus = guild.settings.publicJoin ? '🟢 Enabled' : '🔴 Disabled';

    const message = `
⚙️ *${guild.name} - Guild Settings*

*Current Settings:*
Description: ${guild.description}
Public Join: ${publicJoinStatus}
Minimum Level: ${guild.settings.minLevel}

What would you like to change?
    `;

    await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
  }

  async _inviteMember(msg, targetId) {
      const userId = msg.from.id;
      const character = this.gameEngine.getCharacter(userId);
      const guild = character.guild ? this.db.getGuild(character.guild) : null;

      if (!guild || guild.leader !== userId) {
          return this.bot.sendMessage(msg.chat.id, "❌ You are not the guild leader.");
      }

      const targetCharacter = this.gameEngine.getCharacter(parseInt(targetId));
      if (!targetCharacter) {
          return this.bot.sendMessage(msg.chat.id, "❌ Target character not found.");
      }
      if (targetCharacter.guild) {
          return this.bot.sendMessage(msg.chat.id, "❌ Target is already in a guild.");
      }

      const invitation = {
          guildId: guild.id,
          inviterId: userId,
          expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
      };
      this.db.setGuildInvitation(targetCharacter.id.toString(), invitation);

      await this.bot.sendMessage(msg.chat.id, `✅ Invitation sent to ${targetCharacter.name}.`);
      await this.bot.sendMessage(targetCharacter.id, `✉️ You have received a guild invitation from *${guild.name}*! Use /guild to view it.`, { parse_mode: 'Markdown' });
  }

  async _disbandGuild(chatId, userId) {
    const character = this.gameEngine.getCharacter(userId);
    const guild = character.guild ? this.db.getGuild(character.guild) : null;

    if (!guild || guild.leader !== userId) {
      return this.bot.sendMessage(chatId, '❌ You are not the guild leader or not in a guild.');
    }

    // Remove guild from all members
    for (const memberId of guild.members) {
      const memberChar = this.gameEngine.getCharacter(memberId);
      if (memberChar) {
        memberChar.guild = null;
        this.gameEngine.updateCharacter(memberId, memberChar);
      }
    }

    // Delete guild from database
    this.db.guilds.delete(guild.id);
    await this.db.saveGuilds();

    await this.bot.sendMessage(chatId, `💥 Guild *${guild.name}* has been disbanded!`);
    await this.notifyGuildMembers(guild, `💥 Your guild *${guild.name}* has been disbanded by the leader.`, userId);
    await this.showNoGuildMenu(chatId);
  }

  async _setGuildDescription(msg, description) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    const guild = character.guild ? this.db.getGuild(character.guild) : null;

    if (!guild || guild.leader !== userId) {
      return this.bot.sendMessage(msg.chat.id, '❌ You are not the guild leader.');
    }

    guild.description = description;
    this.db.setGuild(guild.id, guild);
    await this.bot.sendMessage(msg.chat.id, '✅ Guild description updated!');
    await this._showGuildSettingsMenu(msg.chat.id, guild);
  }

  async _setGuildMinLevel(msg, level) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    const guild = character.guild ? this.db.getGuild(character.guild) : null;

    if (!guild || guild.leader !== userId) {
      return this.bot.sendMessage(msg.chat.id, '❌ You are not the guild leader.');
    }

    const minLevel = parseInt(level);
    if (isNaN(minLevel) || minLevel < 1 || minLevel > 999) {
      return this.bot.sendMessage(msg.chat.id, '❌ Invalid level. Please enter a number between 1 and 999.');
    }

    guild.settings.minLevel = minLevel;
    this.db.setGuild(guild.id, guild);
    await this.bot.sendMessage(msg.chat.id, `✅ Minimum required level set to ${minLevel}.`);
    await this._showGuildSettingsMenu(msg.chat.id, guild);
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