class CombatPlugin {
  constructor(bot, db, gameEngine) {
    this.bot = bot;
    this.db = db;
    this.gameEngine = gameEngine;
    
    this.commands = {
      'hunt': this.handleHunt,
      'attack': this.handleAttack,
      'combat': this.handleCombat
    };
    this.inactiveCombatCheck = setInterval(() => this.gameEngine.checkInactiveCombats(), 60000); // Periksa setiap menit
  }

  cleanup() {
    clearInterval(this.inactiveCombatCheck);
  }

  async init() {
    console.log('Combat plugin initialized');
  }

  async handleHunt(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    const map = this.db.getMap(character.position.map);
    
    if (!map.monsters || map.monsters.length === 0) {
      await this.bot.sendMessage(msg.chat.id,
        `🔍 There are no monsters in this area!\n\nTry moving to a different location.`
      );
      return;
    }

    const randomMonster = map.monsters[Math.floor(Math.random() * map.monsters.length)];
    const monster = this.db.getMonster(randomMonster);
    
    if (!monster) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Monster not found!`
      );
      return;
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '⚔️ Attack', callback_data: `start_combat_${randomMonster}` },
          { text: '🏃 Look for another', callback_data: 'hunt_again' }
        ]
      ]
    };

    // Store hunt state to track if user has chosen
    if (!this.huntStates) {
      this.huntStates = new Map();
    }
    this.huntStates.set(userId, { monsterId: randomMonster, hasChosen: false });
    await this.bot.sendMessage(msg.chat.id,
      `🎯 *Monster Found!*\n\n` +
      `You encountered a ${monster.name}!\n\n` +
      `📊 *Monster Stats:*\n` +
      `📊 Level: ${monster.level}\n` +
      `❤️ HP: ${monster.hp}\n` +
      `⚔️ Attack: ${monster.attack}\n` +
      `🛡️ Defense: ${monster.defense}\n` +
      `✨ EXP Reward: ${monster.exp}\n\n` +
      `What do you want to do?`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  }

  async handleAttack(msg) {
    const userId = msg.from.id;
    const combat = this.gameEngine.getCombat(userId);
    
    if (!combat) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You're not in combat! Use /hunt to find monsters.`
      );
      return;
    }

    if (combat.turn !== 'player') {
      await this.bot.sendMessage(msg.chat.id,
        `⏳ It's not your turn! Wait for the monster's attack.`
      );
      return;
    }

    const result = this.gameEngine.registerPlayerAction(userId, 'attack');
    
    if (result && result.error) {
      await this.bot.sendMessage(msg.chat.id, `❌ ${result.error}`);
      return;
    }

    if (result && result.results) {
      await this.processCombatResult(msg.chat.id, userId, result);
    } else if (result && result.success) {
      const combat = this.gameEngine.getCombat(userId);
      if (combat) {
        await this.showCombatStatus(null, userId);
      }
    }
  }

  async handleCombat(msg) {
    const userId = msg.from.id;
    const combat = this.gameEngine.getCombat(userId);
    
    if (!combat) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You're not in combat! Use /hunt to find monsters.`
      );
      return;
    }

    await this.showCombatStatus(msg.chat.id, userId);
  }

  async showCombatStatus(chatId, userId) {
    const combat = this.gameEngine.getCombat(userId);
    
    if (!combat) {
      // Coba kirim pesan ke chatId jika ada, jika tidak, jangan lakukan apa-apa.
      if (chatId) {
        try {
          await this.bot.sendMessage(chatId, `❌ Pertarungan tidak ditemukan!`);
        } catch (e) {
          console.error(`Gagal mengirim pesan status pertarungan ke ${chatId}`, e)
        }
      }
      return;
    }

    // Untuk pertarungan party, kita perlu mengirim pembaruan ke setiap pemain.
    if (combat.isPartyBattle) {
      for (const player of combat.players) {
        // Kita perlu mendapatkan chatId untuk setiap pemain. Asumsinya adalah ID pengguna.
        const playerChatId = player.id;
        await this.sendIndividualCombatStatus(playerChatId, player.id, combat);
      }
    } else {
      await this.sendIndividualCombatStatus(chatId, userId, combat);
    }
  }

  async sendIndividualCombatStatus(chatId, userId, combat) {
    let playersInfo = '';
    if (combat.isPartyBattle) {
      playersInfo = `👥 *Party Battle*\n\n`;
      for (const player of combat.players) {
        const hasActed = combat.playerActions.has(player.id) ? '✅' : '⏳'
        const playerHpBar = this.createHealthBar(player.hp, player.maxHp);
        playersInfo += `👤 *${player.name}* ${hasActed}\n`;
        playersInfo += `❤️ HP: ${playerHpBar} ${player.hp}/${player.maxHp}\n\n`;
      }
    } else {
      const player = combat.players[0];
      const playerHpBar = this.createHealthBar(player.hp, player.maxHp);
      playersInfo = `👤 *${player.name}*\n`;
      playersInfo += `❤️ HP: ${playerHpBar} ${player.hp}/${player.maxHp}\n`;
      playersInfo += `⚔️ Attack: ${player.attack}\n`;
      playersInfo += `🛡️ Defense: ${player.defense}\n\n`;
    }

    const hasActed = combat.playerActions.has(userId);
    const canAct = combat.turn === 'player' && !hasActed;
    let keyboard = null;
    
    if (canAct) {
      keyboard = {
        inline_keyboard: [
          [
            { text: '⚔️ Attack', callback_data: 'combat_attack' },
            { text: '🛡️ Defend', callback_data: 'combat_defend' }
          ],
          [
            { text: '💊 Use Item', callback_data: 'combat_item' }
          ]
        ]
      };
      
      // Add run button only for solo battles
      if (!combat.isPartyBattle) {
        keyboard.inline_keyboard[1].push({ text: '🏃 Run', callback_data: 'combat_run' });
      }
    }

    const monsterHpBar = this.createHealthBar(combat.monster.hp, combat.monster.maxHp);

    const currentTurnText = combat.turn === 'player' ? 
      (combat.isPartyBattle ? 'Party turn!' : 'Your turn!') : 
      'Monster\'s turn';

    let waitingText = '';
    let statusText = '';
    
    if (combat.isPartyBattle && combat.turn === 'player') {
      const totalPlayers = combat.players.filter(p => p.hp > 0).length;
      const actedPlayers = combat.playerActions.size;
      const waitingPlayers = totalPlayers - actedPlayers;
      
      if (waitingPlayers > 0) {
        waitingText = `\n⏳ Waiting for ${waitingPlayers} more players...`;
      }
      
      if (hasActed) {
        statusText = 'Action selected! Waiting for others...';
      } else {
        statusText = 'Choose your action:';
      }
    } else {
      if (canAct) {
        statusText = 'Choose your action:';
      } else if (hasActed) {
        statusText = 'Action selected! Waiting for turn to process...';
      } else {
        statusText = 'Waiting for your turn...';
      }
    }

    try {
      await this.bot.sendMessage(chatId,
        `⚔️ *Combat Status*\n\n` +
        playersInfo +
        `👹 *${combat.monster.name}*\n` +
        `❤️ HP: ${monsterHpBar} ${combat.monster.hp}/${combat.monster.maxHp}\n` +
        `⚔️ Attack: ${combat.monster.attack}\n` +
        `🛡️ Defense: ${combat.monster.defense}\n\n` +
        `🎯 Turn: ${currentTurnText}${waitingText}\n\n` +
        statusText,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    } catch (e) {
        console.error(`Gagal mengirim status pertarungan ke ${chatId}`, e)
    }
  }

  createHealthBar(current, max) {
    const percentage = current / max;
    const barLength = 10;
    const filled = Math.floor(percentage * barLength);
    const empty = barLength - filled;
    
    return '🟩'.repeat(filled) + '⬜'.repeat(empty);
  }

  async processCombatResult(chatId, userId, result) {
    if (result.cancelled) {
      await this.bot.sendMessage(chatId, '⚔️ Pertarungan telah dibatalkan karena tidak ada aktivitas.');
      return;
    }

    const { combat, results, error } = result;
    
    if (error) {
      await this.bot.sendMessage(chatId, `❌ ${error}`);
      return;
    }
    
    let message = '⚔️ *Combat Round*\n\n';
    
    for (const res of results) {
      if (res.type === 'player_attack') {
        if (res.isCritical) {
          message += `💥 *CRITICAL HIT!* ${res.attacker} attacks ${res.target} for ${res.damage} damage!\n`;
        } else if (res.isMiss) {
          message += `💨 ${res.attacker} attacks ${res.target} but misses!\n`;
        } else {
          message += `💥 ${res.attacker} attacks ${res.target} for ${res.damage} damage!\n`;
        }
      } else if (res.type === 'monster_attack') {
        if (res.isCritical) {
          message += `💥 *CRITICAL HIT!* ${res.attacker} attacks ${res.target} for ${res.damage} damage!\n`;
        } else if (res.isMiss) {
          message += `💨 ${res.attacker} attacks ${res.target} but misses!\n`;
        } else {
          message += `💥 ${res.attacker} attacks ${res.target} for ${res.damage} damage!\n`;
        }
      } else if (res.type === 'evade') {
        message += `💨 ${res.target} evaded the attack from ${res.attacker}!\n`;
      } else if (res.type === 'defend') {
        message += `🛡️ ${res.player} takes a defensive stance!\n`;
      } else if (res.type === 'item_use') {
        message += `💊 ${res.message}\n`;
      } else if (res.type === 'player_action_failed') {
        message += `❌ ${res.message}\n`;
      } else if (res.type === 'run_success') {
        message += `🏃 *You ran away from combat!*\n\nYou escaped safely.\n`;
      } else if (res.type === 'run_fail') {
        message += `❌ Failed to run away!\n`;
      } else if (res.type === 'victory') {
        message += `
🎉 *${combat.isPartyBattle ? 'Party Victory!' : 'Victory!'}*
`;
        message += `You defeated the ${combat.monster.name}!\n`;
      } else if (res.type === 'defeat') {
        message += `\n💀 *${combat.isPartyBattle ? 'Party Defeat!' : 'Defeat!'}\n`;
        message += `You were defeated by the ${combat.monster.name}!\n`;
        message += `You lost some experience and were revived with 1 HP...`;
      } else if (res.type === 'rewards') {
        const rewards = res.rewards;
        console.log('Rewards items before message construction:', rewards.items);
        if (rewards.exp > 0) {
          message += `✨ ${combat.isPartyBattle ? 'Each member gained' : 'Gained'} ${rewards.exp} EXP!\n`;
        } else if (rewards.exp < 0) {
          message += `💀 Lost ${Math.abs(rewards.exp)} EXP!\n`;
        }
        
        if (rewards.zeny > 0) {
          message += `💰 ${combat.isPartyBattle ? 'Each member found' : 'Found'} ${rewards.zeny} Zeny!\n`;
        }
        
        if (rewards.items.length > 0) {
          message += `🎁 *Items obtained:*\n`;
          for (const item of rewards.items) {
            const recipient = item.recipient ? ` (${item.recipient})` : '';
            message += `• ${item.name} x${item.quantity}${recipient}\n`;
          }
        } else {
          message += `
No items obtained.
`;
        }
        
        if (rewards.levelUp) {
          message += `\n🎉 *LEVEL UP!* ${combat.isPartyBattle ? 'Party members are' : 'You are'} now stronger!\n`;
        }
      }
    }

    await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    // Notify all party members if it's a party battle
    if (combat.isPartyBattle) {
      const partyPlugin = this.gameEngine.pluginManager.getPlugin('party');
      if (partyPlugin) {
        const party = partyPlugin.parties.get(combat.partyId);
        if (party) {
          for (const memberId of party.members) {
            if (memberId !== userId) {
              try {
                await this.bot.sendMessage(memberId, message, { parse_mode: 'Markdown' });
              } catch (error) {
                console.log(`Failed to notify party member ${memberId}`);
              }
            }
          }
        }
      }
    }
    if (combat.status === 'active') {
      // Tampilkan status pertarungan yang diperbarui untuk semua orang
      setTimeout(() => {
        this.showCombatStatus(null, userId); // Broadcast to all party members
      }, 2000);
    }
  }

  async handleCallback(callbackQuery) {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    console.log(`[CombatPlugin] Raw data received: ${data}`); // Added log
    console.log(`Combat plugin handling callback: ${data} for user ${userId}`);

    // Initialize hunt states if not exists
    if (!this.huntStates) {
      this.huntStates = new Map();
    }
    if (data.startsWith('start_combat_')) {
      const huntState = this.huntStates.get(userId);
      if (huntState && huntState.hasChosen) {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'You already chose an action!' });
        return true;
      }

      const monsterId = data.replace('start_combat_', '');
      
      // Mark as chosen
      if (huntState) {
        huntState.hasChosen = true;
      }

      await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Starting combat...' });
      
      // Send confirmation message without buttons
      await this.bot.sendMessage(callbackQuery.message.chat.id,
        `⚔️ *Combat Starting!*\n\nPreparing to fight the monster...`
      );

      const combat = this.gameEngine.startCombat(userId, monsterId);
      
      if (combat) {
        // Tampilkan status pertarungan setelah penundaan singkat
        setTimeout(async () => {
          // showCombatStatus sekarang menangani pengiriman ke semua anggota party
          await this.showCombatStatus(callbackQuery.message.chat.id, userId);
        }, 500);
      } else {
        await this.bot.sendMessage(callbackQuery.message.chat.id, '❌ Failed to start combat!');
      }
      
      // Clean up hunt state
      this.huntStates.delete(userId);
      return true;
    }

    if (data === 'hunt_again') {
      const huntState = this.huntStates.get(userId);
      if (huntState && huntState.hasChosen) {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'You already chose an action!' });
        return true;
      }

      await this.bot.answerCallbackQuery(callbackQuery.id);
      
      // Mark as chosen
      if (huntState) {
        huntState.hasChosen = true;
      }
      
      // Send confirmation message
      await this.bot.sendMessage(callbackQuery.message.chat.id,
        `🔍 *Looking for another monster...*`
      );
      
      await this.handleHunt({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      
      // Clean up hunt state
      this.huntStates.delete(userId);
      return true;
    }

    if (data === 'combat_attack') {
      await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Attacking...' });
      const result = this.gameEngine.registerPlayerAction(userId, 'attack');
      
      if (result && result.error) {
        await this.bot.sendMessage(callbackQuery.message.chat.id, `❌ ${result.error}`);
        return true;
      }

      if (result && result.results) {
        await this.processCombatResult(callbackQuery.message.chat.id, userId, result);
      } else if (result && result.success) {
        // Action recorded successfully, send confirmation message
        await this.bot.sendMessage(callbackQuery.message.chat.id, 
          `⚔️ Attack action selected! Waiting for other players...`);
      }
      return true;
    }

    if (data === 'combat_defend') {
      await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Defending...' });
      const result = this.gameEngine.registerPlayerAction(userId, 'defend');
      
      if (result && result.error) {
        await this.bot.sendMessage(callbackQuery.message.chat.id, `❌ ${result.error}`);
        return true;
      }

      if (result && result.results) {
        await this.processCombatResult(callbackQuery.message.chat.id, userId, result);
      } else if (result && result.success) {
        // Action recorded successfully, send confirmation message
        await this.bot.sendMessage(callbackQuery.message.chat.id, 
          `🛡️ Defend action selected! Waiting for other players...`);
      }
      return true;
    }

    if (data === 'combat_item') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      const character = this.gameEngine.getCharacter(userId);
      const items = Object.keys(character.inventory.items);
      
      if (items.length === 0) {
        await this.bot.sendMessage(callbackQuery.message.chat.id, '❌ No items to use!');
        return true;
      }

      const keyboard = { inline_keyboard: [] };
      
      for (const itemId of items) {
        const item = this.db.getItem(itemId);
        if (item && item.type === 'consumable') {
          const quantity = character.inventory.items[itemId];
          keyboard.inline_keyboard.push([
            { text: `💊 ${item.name} (${quantity})`, callback_data: `use_combat_item_${itemId}` }
          ]);
        }
      }

      if (keyboard.inline_keyboard.length === 0) {
        await this.bot.sendMessage(callbackQuery.message.chat.id, '❌ No usable items!');
        return true;
      }

      keyboard.inline_keyboard.push([
        { text: '❌ Cancel', callback_data: 'combat_cancel_item' }
      ]);
      await this.bot.sendMessage(callbackQuery.message.chat.id,
        `💊 *Choose an item to use:*`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
      return true;
    }

    if (data.startsWith('use_combat_item_')) {
      const itemId = data.replace('use_combat_item_', '');
      await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Using item...' });
      const result = this.gameEngine.registerPlayerAction(userId, { type: 'item', itemId: itemId });

      if (result && result.error) {
        await this.bot.sendMessage(callbackQuery.message.chat.id, `❌ ${result.error}`);
        return true;
      }

      if (result && result.results) {
        await this.processCombatResult(callbackQuery.message.chat.id, userId, result);
      } else if (result && result.success) {
        // Action recorded successfully, send confirmation message
        const item = this.db.getItem(itemId);
        await this.bot.sendMessage(callbackQuery.message.chat.id, 
          `💊 ${item ? item.name : 'Item'} selected! Waiting for other players...`);
      }
      return true;
    }

    if (data === 'combat_cancel_item') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      const combat = this.gameEngine.getCombat(userId);
      if (combat) {
        await this.showCombatStatus(callbackQuery.message.chat.id, userId);
      }
      return true;
    }
    if (data === 'combat_run') {
      await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Attempting to run...' });
      const result = this.gameEngine.registerPlayerAction(userId, 'run');

      if (result && result.error) {
        await this.bot.sendMessage(callbackQuery.message.chat.id, `❌ ${result.error}`);
        return true;
      }

      if (result && result.results) {
        await this.processCombatResult(callbackQuery.message.chat.id, userId, result);
      } else if (result && result.success) {
        // Action recorded successfully, send confirmation message
        await this.bot.sendMessage(callbackQuery.message.chat.id, 
          `🏃 Run action selected! Waiting for turn to process...`);
      }
      return true;
    }

    // If no specific callback was handled, return false
    return false;
  }
}

module.exports = CombatPlugin;