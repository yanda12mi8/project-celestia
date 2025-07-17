class PartyPlugin {
  constructor(bot, db, gameEngine) {
    this.bot = bot;
    this.db = db;
    this.gameEngine = gameEngine;
    
    this.playerStates = new Map(); // For multi-step actions

    this.commands = {
      'party': this.handleParty.bind(this)
    };
    
    this.parties = this.db.getAllParties(); // Load parties from DB
    this.invitations = new Map();

    this.textHandler = this.handleTextMessage.bind(this);
  }

  async init() {
    console.log('Party plugin initialized');
  }

  async handleParty(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) {
        await this.bot.sendMessage(msg.chat.id, "❌ You don't have a character!");
        return;
    }

    const party = this.getPlayerParty(userId);
    
    if (party) {
      await this._showPartyMenu(msg.chat.id, userId, party);
    } else {
      await this._showNoPartyMenu(msg.chat.id);
    }
  }

  async _showNoPartyMenu(chatId) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '➕ Create Party', callback_data: 'party_create_prompt' },
          { text: '✉️ View Invitations', callback_data: 'party_invites_view' }
        ],
        [
          { text: '📋 Browse Parties', callback_data: 'party_list_browse' }
        ]
      ]
    };

    const message = `
👥 *Party System*

You are not currently in a party. Parties allow you to:

- Share EXP and loot with teammates.
- Tackle challenging dungeons together.
- Communicate privately with party chat.

What would you like to do?
    `;

    await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
  }

  async _showPartyMenu(chatId, userId, party) {
    const isLeader = party.leader === userId;
    const leaderChar = this.gameEngine.getCharacter(party.leader);
    const leaderName = leaderChar ? leaderChar.name : 'Unknown';

    let keyboard = [
      [{ text: '👥 View Members', callback_data: 'party_members_view' }],
      [{ text: '💬 Send Party Chat', callback_data: 'party_chat_prompt' }],
      isLeader ? { text: '➕ Invite Member', callback_data: 'party_invite_prompt' } : null,
      isLeader ? { text: '⚙️ Settings', callback_data: 'party_settings_menu' } : null,
      isLeader ? { text: '❌ Disband Party', callback_data: 'party_disband_confirm' } : { text: '👋 Leave Party', callback_data: 'party_leave_confirm' }
    ].filter(Boolean).map(btn => Array.isArray(btn) ? btn : [btn]);

    const message = `
👥 *Party: ${party.name}*

👑 *Leader:* ${leaderName}
📊 *Members:* ${party.members.length}/${party.settings.maxMembers}

> ${party.description || 'A group ready for adventure!'}
    `;

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  async handleTextMessage(msg) {
    const userId = msg.from.id;
    const state = this.playerStates.get(userId);

    if (!state) return; // Not waiting for any input

    this.playerStates.delete(userId); // Consume the state

    if (state === 'awaiting_party_name') {
      await this._createParty(msg, msg.text);
    } else if (state === 'awaiting_invitee_id') {
      await this._inviteMember(msg, msg.text);
    } else if (state === 'awaiting_chat_message') {
      await this._sendPartyChat(msg, msg.text);
    } else if (state === 'awaiting_party_description') {
      await this._setPartyDescription(msg, msg.text);
    } else if (state === 'awaiting_party_max_members') {
      await this._setPartyMaxMembers(msg, msg.text);
    }
  }

  async handleCallback(callbackQuery) {
    try {
      const userId = callbackQuery.from.id;
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;

      // console.log(`[PartyPlugin] Received callback: ${data}`);
      // console.log(`[PartyPlugin] Type of data: ${typeof data}`);
      // console.log(`[PartyPlugin] data === 'party_create_prompt': ${data === 'party_create_prompt'}`);

      await this.bot.answerCallbackQuery(callbackQuery.id);

      const character = this.gameEngine.getCharacter(userId);
      if (!character) {
          await this.bot.sendMessage(chatId, "❌ You need a character to interact with parties.");
          return true; // Return true here as well, since we handled the error
      }
      const party = this.getPlayerParty(userId);

      // Handle dynamic callbacks first
      if (data.startsWith('party_accept_invite_')) {
        console.log(`[PartyPlugin] Matched party_accept_invite_ for ${data}`);
        const inviteId = data.replace('party_accept_invite_', '');
        await this._acceptPartyInvite(chatId, userId, inviteId);
        return true;
      } else if (data.startsWith('party_decline_invite_')) {
        console.log(`[PartyPlugin] Matched party_decline_invite_ for ${data}`);
        const inviteId = data.replace('party_decline_invite_', '');
        await this._declinePartyInvite(chatId, userId, inviteId);
        return true;
      }

      console.log(`[PartyPlugin] Attempting to match static callback: ${data}`);

      switch (data) {
        case 'party_create_prompt':
          console.log(`[PartyPlugin] Entered case: party_create_prompt for user ${userId}`);
          this.playerStates.set(userId, 'awaiting_party_name');
          await this.bot.sendMessage(chatId, '📝 Please type the desired name for your new party.');
          return true;

        case 'party_list_browse':
          console.log(`[PartyPlugin] Entered case: party_list_browse for user ${userId}`);
          await this._listParties(chatId);
          return true;

        case 'party_invites_view':
          console.log(`[PartyPlugin] Entered case: party_invites_view for user ${userId}`);
          await this._listInvitations(chatId, userId);
          return true;

        case 'party_members_view':
          console.log(`[PartyPlugin] Entered case: party_members_view for user ${userId}`);
          if (party) await this._listMembers(chatId, party);
          return true;
        
        case 'party_chat_prompt':
          console.log(`[PartyPlugin] Entered case: party_chat_prompt for user ${userId}`);
          this.playerStates.set(userId, 'awaiting_chat_message');
          await this.bot.sendMessage(chatId, '💬 Type the message you want to send to your party.');
          return true;

        case 'party_invite_prompt':
          console.log(`[PartyPlugin] Entered case: party_invite_prompt for user ${userId}`);
          this.playerStates.set(userId, 'awaiting_invitee_id');
          await this.bot.sendMessage(chatId, '👤 Please enter the Character ID of the player you want to invite.');
          return true;

        case 'party_leave_confirm':
          console.log(`[PartyPlugin] Entered case: party_leave_confirm for user ${userId}`);
          await this.bot.sendMessage(chatId, 'Are you sure you want to leave the party?', {
            reply_markup: { inline_keyboard: [[{ text: '✅ Yes, I want to leave', callback_data: 'party_leave_execute' }, { text: '❌ Cancel', callback_data: 'party_menu_show' }]] }
          });
          return true;

        case 'party_leave_execute':
          console.log(`[PartyPlugin] Entered case: party_leave_execute for user ${userId}`);
          await this._leaveParty(chatId, userId);
          return true;
        
        case 'party_disband_confirm':
          console.log(`[PartyPlugin] Entered case: party_disband_confirm for user ${userId}`);
          await this.bot.sendMessage(chatId, 'Are you absolutely sure you want to disband your party? This action cannot be undone.', {
            reply_markup: { inline_keyboard: [[{ text: '✅ Yes, Disband Party', callback_data: 'party_disband_execute' }, { text: '❌ Cancel', callback_data: 'party_menu_show' }]] }
          });
          return true;

        case 'party_disband_execute':
          console.log(`[PartyPlugin] Entered case: party_disband_execute for user ${userId}`);
          await this._disbandParty(chatId, userId);
          return true;

        case 'party_settings_menu':
          console.log(`[PartyPlugin] Entered case: party_settings_menu for user ${userId}`);
          if (party && party.leader === userId) {
            await this._showPartySettingsMenu(chatId, party);
          } else {
            await this.bot.sendMessage(chatId, '❌ You are not the party leader.');
          }
          return true;

        case 'party_setting_description':
          console.log(`[PartyPlugin] Entered case: party_setting_description for user ${userId}`);
          this.playerStates.set(userId, 'awaiting_party_description');
          await this.bot.sendMessage(chatId, '📝 Please type the new description for your party.');
          return true;

        case 'party_setting_exp_share':
          console.log(`[PartyPlugin] Entered case: party_setting_exp_share for user ${userId}`);
          if (party && party.leader === userId) {
            party.settings.expShare = !party.settings.expShare;
            this.parties.set(party.id, party);
            await this.bot.sendMessage(chatId, `📈 EXP Share is now ${party.settings.expShare ? 'Enabled' : 'Disabled'}.`);
            await this._showPartySettingsMenu(chatId, party);
          } else {
            await this.bot.sendMessage(chatId, '❌ You are not the party leader.');
          }
          return true;

        case 'party_setting_item_share':
          console.log(`[PartyPlugin] Entered case: party_setting_item_share for user ${userId}`);
          if (party && party.leader === userId) {
            party.settings.itemShare = !party.settings.itemShare;
            this.parties.set(party.id, party);
            await this.bot.sendMessage(chatId, `🎁 Item Share is now ${party.settings.itemShare ? 'Enabled' : 'Disabled'}.`);
            await this._showPartySettingsMenu(chatId, party);
          } else {
            await this.bot.sendMessage(chatId, '❌ You are not the party leader.');
          }
          return true;
        
        case 'party_setting_afk':
          console.log(`[PartyPlugin] Entered case: party_setting_afk for user ${userId}`);
          if (party && party.leader === userId) {
            party.settings.afk = !party.settings.afk;
            this.parties.set(party.id, party);
            await this.bot.sendMessage(chatId, `😴 AFK is now ${party.settings.afk ? 'Enabled' : 'Disabled'}.`);
            await this._showPartySettingsMenu(chatId, party);
          } else {
            await this.bot.sendMessage(chatId, '❌ You are not the party leader.');
          }
          return true;

        case 'party_setting_max_members':
          console.log(`[PartyPlugin] Entered case: party_setting_max_members for user ${userId}`);
          this.playerStates.set(userId, 'awaiting_party_max_members');
          await this.bot.sendMessage(chatId, '👥 Please enter the new maximum number of members for your party (2-6).');
          return true;

        case 'party_menu_show':
          console.log(`[PartyPlugin] Entered case: party_menu_show for user ${userId}`);
          if (party) await this._showPartyMenu(chatId, userId, party);
          else await this._showNoPartyMenu(chatId);
          return true;

        default:
          console.log(`[PartyPlugin] No case matched for callback: ${data}`);
          return false;
      }
    } catch (error) {
      console.error(`[PartyPlugin] Error in handleCallback: ${error.message}`);
      return false; // Indicate that the callback was NOT handled due to an error
    }
  }

  async _createParty(msg, partyName) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (this.getPlayerParty(userId)) {
      return this.bot.sendMessage(msg.chat.id, '❌ You are already in a party!');
    }
    if (partyName.length < 3 || partyName.length > 30) {
      return this.bot.sendMessage(msg.chat.id, '❌ Party name must be 3-30 characters long.');
    }

    const { randomUUID } = require('crypto');
    const partyId = `party_${randomUUID().slice(0, 8)}`;
    
    const newParty = {
      id: partyId,
      name: partyName,
      leader: userId,
      members: [userId],
      created: Date.now(),
      description: `${partyName} - A new party ready for adventure!`,
      settings: {
        expShare: true,
        itemShare: false,
        maxMembers: this.gameEngine.config.game.maxPartySize || 6,
        afk: false
      },
      stats: {
        dungeonsCleared: 0,
        monstersKilled: 0,
        totalExp: 0
      }
    };

    this.parties.set(partyId, newParty);
    this.db.setParty(partyId, newParty); // Save to DB
    
    await this.bot.sendMessage(msg.chat.id, `🎉 Party *${partyName}* has been created!`);
    await this._showPartyMenu(msg.chat.id, userId, newParty);
  }

  async _inviteMember(msg, targetIdentifier) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    const party = this.getPlayerParty(userId);

    if (!party || party.leader !== userId) {
      return this.bot.sendMessage(msg.chat.id, '❌ You are not the party leader.');
    }

    let targetCharacter = null;
    let targetId = null;

    // Check if targetIdentifier is a number or a string (name)
    if (!isNaN(parseInt(targetIdentifier))) {
        targetId = parseInt(targetIdentifier);
        targetCharacter = this.gameEngine.getCharacter(targetId);
    } else {
        targetId = this.findPlayerByName(targetIdentifier);
        if (targetId) {
            targetCharacter = this.gameEngine.getCharacter(targetId);
        }
    }

    if (!targetCharacter) {
      return this.bot.sendMessage(msg.chat.id, `❌ Character "${targetIdentifier}" not found.`);
    }

    if (this.getPlayerParty(targetCharacter.id)) {
      return this.bot.sendMessage(msg.chat.id, '❌ Target is already in a party.');
    }

    if (party.members.length >= party.settings.maxMembers) {
      return this.bot.sendMessage(msg.chat.id, '❌ Party is full!');
    }

    const { randomUUID } = require('crypto');
    const inviteId = `party_invite_${randomUUID().slice(0, 8)}_${userId}_${targetCharacter.id}`;
    this.invitations.set(inviteId, {
      partyId: party.id,
      inviterId: userId,
      targetId: targetCharacter.id,
      expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
    });

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Accept', callback_data: `party_accept_invite_${inviteId}` },
          { text: '❌ Decline', callback_data: `party_decline_invite_${inviteId}` }
        ]
      ]
    };

    try {
      await this.bot.sendMessage(targetCharacter.id,
        `👥 *Party Invitation*

` +
        `${character.name} has invited you to join "${party.name}"!\n\n` +
        `👑 Leader: ${character.name}
` +
        `📊 Members: ${party.members.length}/${party.settings.maxMembers}

` +
        `Do you want to join?`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );

      await this.bot.sendMessage(msg.chat.id, `✅ Invitation sent to ${targetCharacter.name}!`);
    } catch (error) {
      console.error(`[PartyPlugin] Failed to send invite to ${targetCharacter.id}:`, error);
      await this.bot.sendMessage(msg.chat.id, `❌ Could not send invitation to ${targetCharacter.name}. They may have blocked the bot or the ID is invalid.`);
    }
  }

  async _leaveParty(chatId, userId) {
    const character = this.gameEngine.getCharacter(userId);
    const party = this.getPlayerParty(userId);

    if (!party) {
      return this.bot.sendMessage(chatId, '❌ You are not in a party.');
    }

    if (party.leader === userId) {
      if (party.members.length > 1) {
        // Transfer leadership to next member
        const newLeaderId = party.members.find(id => id !== userId);
        party.leader = newLeaderId;
        
        const newLeaderChar = this.gameEngine.getCharacter(newLeaderId);
        await this.notifyPartyMembers(party, 
          `👑 ${newLeaderChar.name} is now the party leader!`
        );
      } else {
        // Disband party if leader is the only member
        this.parties.delete(party.id);
        this.db.deleteParty(party.id); // Delete from DB
        await this.bot.sendMessage(chatId, `✅ Party *${party.name}* disbanded!`);
        await this._showNoPartyMenu(chatId);
        return;
      }
    }

    // Remove from party
    party.members = party.members.filter(id => id !== userId);
    this.db.setParty(party.id, party); // Save updated party to DB
    
    await this.bot.sendMessage(chatId, `✅ You left the party *${party.name}*.`);
    await this.notifyPartyMembers(party, `👋 ${character.name} has left the party.`);
    await this._showNoPartyMenu(chatId);
  }

  async _listMembers(chatId, party) {
    let membersText = `👥 *${party.name} Members*\n\n`;
    
    for (const memberId of party.members) {
      const memberChar = this.gameEngine.getCharacter(memberId);
      if (memberChar) {
        const role = memberId === party.leader ? '👑' : '👤';
        const afkStatus = party.afkMembers.includes(memberId) ? ' (AFK)' : '';
        const location = memberChar.position.map;
        membersText += `${role} ${memberChar.name} - Lvl. ${memberChar.level}\n`;
        membersText += `   📍 Location: ${location}\n`;
        membersText += `   ❤️ HP: ${memberChar.stats.hp}/${memberChar.stats.maxHp}\n\n`;
      }
    }

    await this.bot.sendMessage(chatId, membersText, { parse_mode: 'Markdown' });
  }

  async _sendPartyChat(msg, message) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    const party = this.getPlayerParty(userId);

    if (!party) {
      return this.bot.sendMessage(msg.chat.id, "❌ You're not in a party!");
    }
    if (!message) return;

    const partyMessage = "👥 *Party Chat*\n👤 " + character.name + ": " + message;
    
    await this.notifyPartyMembers(party, partyMessage, userId);
    await this.bot.sendMessage(msg.chat.id, "✅ Your message has been sent to the party.");
  }

  async _listParties(chatId) {
    const parties = Array.from(this.parties.values());
    if (parties.length === 0) {
      return this.bot.sendMessage(chatId, '📋 No parties found. Be the first to create one!');
    }

    let partyList = '📋 *Active Parties*\n\n';
    for (const party of parties) {
      const leader = this.gameEngine.getCharacter(party.leader);
      partyList += `👥 *${party.name}* (Leader: ${leader ? leader.name : '-'})\n`;
      partyList += `  Members: ${party.members.length}/${party.settings.maxMembers}\n`;
      partyList += `  EXP Share: ${party.settings.expShare ? '✅' : '❌'}\n`;
      partyList += `  Item Share: ${party.settings.itemShare ? '✅' : '❌'}\n\n`;
    }
    await this.bot.sendMessage(chatId, partyList, { parse_mode: 'Markdown' });
  }

  async _listInvitations(chatId, userId) {
    const invitations = Array.from(this.invitations.values()).filter(invite => invite.targetId === userId && invite.expiresAt > Date.now());
    if (invitations.length === 0) {
      return this.bot.sendMessage(chatId, '✉️ You have no pending party invitations.');
    }

    let inviteMessage = '✉️ *Your Party Invitations*\n\n';
    for (const invite of invitations) {
      const party = this.parties.get(invite.partyId);
      if (party) {
        const inviter = this.gameEngine.getCharacter(invite.inviterId);
        inviteMessage += `👥 *${party.name}* from ${inviter ? inviter.name : 'Unknown'}\n`;
        inviteMessage += `  Members: ${party.members.length}/${party.settings.maxMembers}\n`;
        inviteMessage += `  _Expires: ${new Date(invite.expiresAt).toLocaleString()}_\n`;
        inviteMessage += `\n`;
        const keyboard = {
          inline_keyboard: [
            [{ text: '✅ Accept', callback_data: `party_accept_invite_${invite.id}` }],
            [{ text: '❌ Decline', callback_data: `party_decline_invite_${invite.id}` }]
          ]
        };
        await this.bot.sendMessage(chatId, inviteMessage, { parse_mode: 'Markdown', reply_markup: keyboard });
        inviteMessage = ''; // Clear for next invite
      }
    }
    if (inviteMessage) { // Send any remaining message if there was only one invite
        await this.bot.sendMessage(chatId, inviteMessage, { parse_mode: 'Markdown' });
    }
  }

  async _acceptPartyInvite(chatId, userId, inviteId) {
    const invitation = this.invitations.get(inviteId);
    if (!invitation) {
      return this.bot.sendMessage(chatId, '❌ Invitation expired or invalid.');
    }
    if (invitation.expiresAt < Date.now()) {
      return this.bot.sendMessage(chatId, '❌ Invitation expired or invalid.');
    }
    if (invitation.targetId !== userId) {
      return this.bot.sendMessage(chatId, '❌ Invitation expired or invalid.');
    }

    const party = this.parties.get(invitation.partyId);
    if (!party) {
      return this.bot.sendMessage(chatId, '❌ Party no longer exists!');
    }
    if (this.getPlayerParty(userId)) {
      return this.bot.sendMessage(chatId, '❌ You are already in a party. Leave it first to accept a new invitation.');
    }
    if (party.members.length >= party.settings.maxMembers) {
      return this.bot.sendMessage(chatId, '❌ Party is full!');
    }

    // Add to party
    party.members.push(userId);
    this.invitations.delete(inviteId);
    this.db.setParty(party.id, party); // Save updated party to DB

    const character = this.gameEngine.getCharacter(userId);
    await this.bot.sendMessage(chatId, `🎉 You have joined *${party.name}*!`);
    await this.notifyPartyMembers(party, `🎉 ${character.name} has joined the party!`, userId);
    await this._showPartyMenu(chatId, userId, party);
  }

  async _declinePartyInvite(chatId, userId, inviteId) {
    const invitation = this.invitations.get(inviteId);
    if (!invitation || invitation.expiresAt < Date.now() || invitation.targetId !== userId) {
      return this.bot.sendMessage(chatId, '❌ Invitation expired or invalid.');
    }

    const party = this.parties.get(invitation.partyId);
    if (!party) {
      return this.bot.sendMessage(chatId, '❌ Party no longer exists!');
    }

    this.invitations.delete(inviteId);
    await this.bot.sendMessage(chatId, `You have declined the invitation to *${party.name}*.`);
    await this._showNoPartyMenu(chatId);
  }

  async _disbandParty(chatId, userId) {
    const party = this.getPlayerParty(userId);
    if (!party || party.leader !== userId) {
      return this.bot.sendMessage(chatId, '❌ You are not the party leader or not in a party.');
    }

    // Remove party from all members
    for (const memberId of party.members) {
      // In a real scenario, you might clear their party reference in their character object
      // For this example, we just remove the party itself.
    }

    this.parties.delete(party.id);
    this.db.deleteParty(party.id); // Delete from DB
    await this.notifyPartyMembers(party, `💥 Your party *${party.name}* has been disbanded by the leader.`, userId);
    await this._showNoPartyMenu(chatId);
  }

  async _showPartySettingsMenu(chatId, party) {
    const keyboard = {
      inline_keyboard: [
        [{ text: '📝 Change Description', callback_data: 'party_setting_description' }],
        [{ text: `📈 EXP Share: ${party.settings.expShare ? '✅ Enabled' : '❌ Disabled'}`, callback_data: 'party_setting_exp_share' }],
        [{ text: `🎁 Item Share: ${party.settings.itemShare ? '✅ Enabled' : '❌ Disabled'}`, callback_data: 'party_setting_item_share' }],
        [{ text: `😴 AFK : ${party.settings.afk ? '✅ Enabled' : '❌ Disabled'}`, callback_data: 'party_setting_afk' }],
        [{ text: '👥 Set Max Members', callback_data: 'party_setting_max_members' }],
        [{ text: '🔙 Back to Party Menu', callback_data: 'party_menu_show' }]
      ]
    };

    const message = `
⚙️ *${party.name} - Party Settings*

*Current Settings:*
Description: ${party.description}
EXP Share: ${party.settings.expShare ? 'Enabled' : 'Disabled'}
Item Share: ${party.settings.itemShare ? 'Enabled' : 'Disabled'}
AFK : ${party.settings.afk ? 'Enabled' : 'Disabled'}
Max Members: ${party.settings.maxMembers}

What would you like to change?
    `;

    await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
  }

  async _setPartyDescription(msg, description) {
    const userId = msg.from.id;
    const party = this.getPlayerParty(userId);

    if (!party || party.leader !== userId) {
      return this.bot.sendMessage(msg.chat.id, '❌ You are not the party leader.');
    }

    party.description = description;
    this.parties.set(party.id, party);
    this.db.setParty(party.id, party); // Save to DB
    await this.bot.sendMessage(msg.chat.id, '✅ Party description updated!');
    await this._showPartySettingsMenu(msg.chat.id, party);
  }

  async _setPartyMaxMembers(msg, maxMembers) {
    const userId = msg.from.id;
    const party = this.getPlayerParty(userId);

    if (!party || party.leader !== userId) {
      return this.bot.sendMessage(msg.chat.id, '❌ You are not the party leader.');
    }

    const newMax = parseInt(maxMembers);
    if (isNaN(newMax) || newMax < 2 || newMax > 6) {
      return this.bot.sendMessage(msg.chat.id, '❌ Invalid number. Max members must be between 2 and 6.');
    }
    if (newMax < party.members.length) {
      return this.bot.sendMessage(msg.chat.id, `❌ Cannot set max members to ${newMax}. You have ${party.members.length} members currently.`);
    }

    party.settings.maxMembers = newMax;
    this.parties.set(party.id, party);
    this.db.setParty(party.id, party); // Save to DB
    await this.bot.sendMessage(msg.chat.id, `✅ Max members set to ${newMax}.`);
    await this._showPartySettingsMenu(msg.chat.id, party);
  }

  async notifyPartyMembers(party, message, excludeId = null) {
    for (const memberId of party.members) {
      if (memberId === excludeId) continue;
      try {
        await this.bot.sendMessage(memberId.toString(), message, { parse_mode: 'Markdown' });
      } catch (error) {
        console.log(`Failed to send message to party member ${memberId}: ${error.message}`);
      }
    }
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

  
}

module.exports = PartyPlugin;
