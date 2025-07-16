class PartyPlugin {
  constructor(bot, db, gameEngine) {
    this.bot = bot;
    this.db = db;
    this.gameEngine = gameEngine;
    
    this.commands = {
      'party': this.handleParty,
      'pcreate': this.handleCreateParty,
      'pinvite': this.handleInviteParty,
      'pjoin': this.handleJoinParty,
      'pleave': this.handleLeaveParty,
      'pkick': this.handleKickParty,
      'pmembers': this.handlePartyMembers,
      'pchat': this.handlePartyChat,
      'pshare': this.handlePartyShare
    };
    
    this.parties = new Map();
    this.invitations = new Map();
  }

  async init() {
    console.log('Party plugin initialized');
  }

  async handleParty(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    const party = this.getPlayerParty(userId);
    
    if (party) {
      await this.showPartyInfo(msg.chat.id, party);
    } else {
      const keyboard = {
        inline_keyboard: [
          [
            { text: '👥 Create Party', callback_data: 'create_party' },
            { text: '📋 Party List', callback_data: 'party_list' }
          ]
        ]
      };

      await this.bot.sendMessage(msg.chat.id,
        `👥 *Party System*\n\n` +
        `You're not in a party yet!\n\n` +
        `🎯 *Benefits of parties:*\n` +
        `• Shared EXP and drops\n` +
        `• Access to dungeons\n` +
        `• Group combat bonuses\n` +
        `• Party chat and coordination\n\n` +
        `What would you like to do?`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    }
  }

  async handleCreateParty(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    if (this.getPlayerParty(userId)) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You're already in a party! Leave your current party first.`
      );
      return;
    }

    const args = msg.text.split(' ').slice(1);
    const partyName = args.length > 0 ? args.join(' ') : `${character.name}'s Party`;

    const { randomUUID } = require('crypto');
    const partyId = `party_${randomUUID().slice(0, 8)}`;
    const party = {
      id: partyId,
      name: partyName,
      leader: userId,
      members: [userId],
      created: Date.now(),
      settings: {
        expShare: true,
        itemShare: false,
        maxMembers: this.gameEngine.config.game.maxPartySize || 6
      },
      stats: {
        dungeonsCleared: 0,
        monstersKilled: 0,
        totalExp: 0
      }
    };

    this.parties.set(partyId, party);
    
    await this.bot.sendMessage(msg.chat.id,
      `🎉 *Party Created Successfully!*\n\n` +
      `👥 Party Name: ${partyName}\n` +
      `👑 Leader: ${character.name}\n` +
      `📊 Members: 1/${party.settings.maxMembers}\n\n` +
      `Use /pinvite <player_name> to invite players!`,
      { parse_mode: 'Markdown' }
    );
  }

  async handleInviteParty(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    const party = this.getPlayerParty(userId);
    if (!party) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You're not in a party! Create one first.`
      );
      return;
    }

    if (party.leader !== userId) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Only the party leader can invite members!`
      );
      return;
    }

    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Please specify a player name!\n\n` +
        `Usage: /pinvite <player_name>\n` +
        `Example: /pinvite PlayerName`
      );
      return;
    }

    const targetName = args.join(' ');
    const targetUserId = this.findPlayerByName(targetName);
    
    if (!targetUserId) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Player "${targetName}" not found!`
      );
      return;
    }

    if (party.members.includes(targetUserId)) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ ${targetName} is already in your party!`
      );
      return;
    }

    if (party.members.length >= party.settings.maxMembers) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Party is full! (${party.members.length}/${party.settings.maxMembers})`
      );
      return;
    }

    // Send invitation
    const inviteId = `invite_${Date.now()}`;
    this.invitations.set(inviteId, {
      partyId: party.id,
      inviter: userId,
      target: targetUserId,
      expires: Date.now() + 300000 // 5 minutes
    });

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Accept', callback_data: `party_accept_${inviteId}` },
          { text: '❌ Decline', callback_data: `party_decline_${inviteId}` }
        ]
      ]
    };

    try {
      await this.bot.sendMessage(targetUserId,
        `👥 *Party Invitation*\n\n` +
        `${character.name} has invited you to join "${party.name}"!\n\n` +
        `👑 Leader: ${character.name}\n` +
        `📊 Members: ${party.members.length}/${party.settings.maxMembers}\n\n` +
        `Do you want to join?`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );

      await this.bot.sendMessage(msg.chat.id,
        `✅ Invitation sent to ${targetName}!`
      );
    } catch (error) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Could not send invitation to ${targetName}. They may have blocked the bot.`
      );
    }
  }

  async handleLeaveParty(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    const party = this.getPlayerParty(userId);
    if (!party) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You're not in a party!`
      );
      return;
    }

    if (party.leader === userId) {
      if (party.members.length > 1) {
        // Transfer leadership to next member
        const newLeader = party.members.find(id => id !== userId);
        party.leader = newLeader;
        
        const newLeaderChar = this.gameEngine.getCharacter(newLeader);
        await this.notifyPartyMembers(party, 
          `👑 ${newLeaderChar.name} is now the party leader!`
        );
      } else {
        // Disband party if leader is the only member
        this.parties.delete(party.id);
        await this.bot.sendMessage(msg.chat.id,
          `✅ Party disbanded!`
        );
        return;
      }
    }

    // Remove from party
    party.members = party.members.filter(id => id !== userId);
    
    await this.bot.sendMessage(msg.chat.id,
      `✅ You left the party "${party.name}".`
    );

    await this.notifyPartyMembers(party, 
      `👋 ${character.name} has left the party.`
    );
  }

  async handlePartyMembers(msg) {
    const userId = msg.from.id;
    const party = this.getPlayerParty(userId);
    
    if (!party) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You're not in a party!`
      );
      return;
    }

    let membersText = `👥 *${party.name} Members*\n\n`;
    
    for (const memberId of party.members) {
      const memberChar = this.gameEngine.getCharacter(memberId);
      if (memberChar) {
        const role = memberId === party.leader ? '👑 Leader' : '👤 Member';
        const location = memberChar.position.map;
        membersText += `${role} ${memberChar.name} (Level ${memberChar.level})\n`;
        membersText += `   📍 Location: ${location}\n`;
        membersText += `   ❤️ HP: ${memberChar.stats.hp}/${memberChar.stats.maxHp}\n\n`;
      }
    }

    await this.bot.sendMessage(msg.chat.id, membersText, { parse_mode: 'Markdown' });
  }

  async handlePartyChat(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    const party = this.getPlayerParty(userId);
    if (!party) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You're not in a party!`
      );
      return;
    }

    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Please provide a message!\n\n` +
        `Usage: /pchat <message>\n` +
        `Example: /pchat Let's go to the dungeon!`
      );
      return;
    }

    const message = args.join(' ');
    const partyMessage = `👥 *Party Chat*\n👤 ${character.name}: ${message}`;
    
    await this.notifyPartyMembers(party, partyMessage);
  }

  getPlayerParty(userId) {
    for (const party of this.parties.values()) {
      if (party.members.includes(userId)) {
        return party;
      }
    }
    return null;
  }

  findPlayerByName(name) {
    const characters = this.db.getAllCharacters();
    for (const [userId, character] of characters) {
      if (character.name.toLowerCase() === name.toLowerCase()) {
        return parseInt(userId);
      }
    }
    return null;
  }

  async showPartyInfo(chatId, party) {
    const leader = this.gameEngine.getCharacter(party.leader);
    const leaderName = leader ? leader.name : 'Unknown';

    const keyboard = {
      inline_keyboard: [
        [
          { text: '👥 Members', callback_data: 'party_members' },
          { text: '⚙️ Settings', callback_data: 'party_settings' }
        ],
        [
          { text: '🏰 Enter Dungeon', callback_data: 'party_dungeon' },
          { text: '👋 Leave Party', callback_data: 'leave_party' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId,
      `👥 *${party.name}*\n\n` +
      `👑 Leader: ${leaderName}\n` +
      `📊 Members: ${party.members.length}/${party.settings.maxMembers}\n` +
      `📅 Created: ${new Date(party.created).toLocaleDateString()}\n\n` +
      `📈 *Party Stats:*\n` +
      `🏰 Dungeons Cleared: ${party.stats.dungeonsCleared}\n` +
      `👹 Monsters Killed: ${party.stats.monstersKilled}\n` +
      `✨ Total EXP: ${party.stats.totalExp}\n\n` +
      `⚙️ *Settings:*\n` +
      `💰 EXP Share: ${party.settings.expShare ? '✅' : '❌'}\n` +
      `🎁 Item Share: ${party.settings.itemShare ? '✅' : '❌'}`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  }

  async notifyPartyMembers(party, message) {
    for (const memberId of party.members) {
      try {
        await this.bot.sendMessage(memberId, message, { parse_mode: 'Markdown' });
      } catch (error) {
        console.log(`Failed to send message to party member ${memberId}`);
      }
    }
  }

  async handleCallback(callbackQuery) {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (data === 'create_party') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.bot.sendMessage(callbackQuery.message.chat.id,
        `👥 *Create Party*\n\n` +
        `To create a party, use the command:\n` +
        `/pcreate [party_name]\n\n` +
        `Example: /pcreate Adventure Squad\n\n` +
        `If no name is provided, it will use your character name.`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    if (data.startsWith('party_accept_')) {
      const inviteId = data.replace('party_accept_', '');
      const invitation = this.invitations.get(inviteId);
      
      if (!invitation || invitation.expires < Date.now()) {
        await this.bot.answerCallbackQuery(callbackQuery.id, 'Invitation expired!');
        return true;
      }

      const party = this.parties.get(invitation.partyId);
      if (!party) {
        await this.bot.answerCallbackQuery(callbackQuery.id, 'Party no longer exists!');
        return true;
      }

      if (party.members.length >= party.settings.maxMembers) {
        await this.bot.answerCallbackQuery(callbackQuery.id, 'Party is full!');
        return true;
      }

      // Add to party
      party.members.push(userId);
      this.invitations.delete(inviteId);

      const character = this.gameEngine.getCharacter(userId);
      await this.bot.answerCallbackQuery(callbackQuery.id, 'Joined party!');
      
      await this.notifyPartyMembers(party, 
        `🎉 ${character.name} has joined the party!`
      );
      return true;
    }

    if (data.startsWith('party_decline_')) {
      const inviteId = data.replace('party_decline_', '');
      this.invitations.delete(inviteId);
      
      await this.bot.answerCallbackQuery(callbackQuery.id, 'Invitation declined');
      await this.bot.sendMessage(callbackQuery.message.chat.id,
        `❌ You declined the party invitation.`
      );
      return true;
    }

    if (data === 'party_members') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.handlePartyMembers({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      return true;
    }

    if (data === 'leave_party') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.handleLeaveParty({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      return true;
    }

    return false;
  }
}

module.exports = PartyPlugin;