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

    const result = this.gameEngine.performAttack(userId);
    
    if (result) {
      await this.processCombatResult(msg.chat.id, userId, result);
    } else {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Failed to perform attack!`
      );
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
      await this.bot.sendMessage(chatId,
        `❌ Combat not found!`
      );
      return;
    }

    let playersInfo = '';
    if (combat.isPartyBattle) {
      playersInfo = `👥 *Party Battle*\n\n`;
      for (let i = 0; i < combat.players.length; i++) {
        const player = combat.players[i];
        const isCurrentTurn = combat.turn === 'player' && combat.currentPlayerIndex === i;
        const turnIndicator = isCurrentTurn ? '🎯 ' : '';
        const playerHpBar = this.createHealthBar(player.hp, player.maxHp);
        playersInfo += `${turnIndicator}👤 *${player.name}*\n`;
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
    const keyboard = {
      inline_keyboard: [
        [
          { text: '⚔️ Attack', callback_data: 'combat_attack' },
          { text: '🛡️ Defend', callback_data: 'combat_defend' }
        ],
        [
          { text: '💊 Use Item', callback_data: 'combat_item' },
          { text: '🏃 Run', callback_data: 'combat_run' }
        ]
      ]
    };

    const monsterHpBar = this.createHealthBar(combat.monster.hp, combat.monster.maxHp);

    const currentTurnText = combat.turn === 'player' ? 
      (combat.isPartyBattle ? 
        `${combat.players[combat.currentPlayerIndex].name}'s turn!` : 
        'Your turn!') : 
      'Monster\'s turn';

    const canAct = combat.turn === 'player' && 
      (!combat.isPartyBattle || combat.players[combat.currentPlayerIndex].id === userId);
    await this.bot.sendMessage(chatId,
      `⚔️ *Combat Status*\n\n` +
      playersInfo +
      `👹 *${combat.monster.name}*\n` +
      `❤️ HP: ${monsterHpBar} ${combat.monster.hp}/${combat.monster.maxHp}\n` +
      `⚔️ Attack: ${combat.monster.attack}\n` +
      `🛡️ Defense: ${combat.monster.defense}\n\n` +
      `🎯 Turn: ${currentTurnText}\n\n` +
      `${canAct ? 'Choose your action:' : 'Waiting...'}`,
      { parse_mode: 'Markdown', reply_markup: canAct ? keyboard : undefined }
    );
  }

  createHealthBar(current, max) {
    const percentage = current / max;
    const barLength = 10;
    const filled = Math.floor(percentage * barLength);
    const empty = barLength - filled;
    
    return '🟩'.repeat(filled) + '⬜'.repeat(empty);
  }

  async processCombatResult(chatId, userId, result) {
    const { combat, results, error } = result;
    
    if (error) {
      await this.bot.sendMessage(chatId, `❌ ${error}`);
      return;
    }
    
    let message = '⚔️ *Combat Round*\n\n';
    
    for (const res of results) {
      if (res.type === 'attack') {
        message += `💥 ${res.attacker} attacks ${res.target} for ${res.damage} damage!\n`;
      } else if (res.type === 'critical') {
        message += `💥 *CRITICAL HIT!* ${res.attacker} attacks ${res.target} for ${res.damage} damage!\n`;
      } else if (res.type === 'evade') {
        message += `💨 ${res.target} evaded the attack from ${res.attacker}!\n`;
      } else if (res.type === 'victory') {
        message += `\n🎉 *${combat.isPartyBattle ? 'Party Victory!' : 'Victory!'}*\n`;
        message += `You defeated the ${combat.monster.name}!\n`;
      } else if (res.type === 'defeat') {
        message += `\n💀 *${combat.isPartyBattle ? 'Party Defeat!' : 'Defeat!'}*\n`;
        message += `You were defeated by the ${combat.monster.name}!\n`;
        message += `You lost some experience and were revived with 1 HP...`;
      } else if (res.type === 'rewards') {
        const rewards = res.rewards;
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
      // Show updated combat status
      setTimeout(() => {
        // Show combat status to all party members
        if (combat.isPartyBattle) {
          for (const player of combat.players) {
            this.showCombatStatus(chatId, player.id);
          }
        } else {
          this.showCombatStatus(chatId, userId);
        }
      }, 2000);
    }
  }

  async handleCallback(callbackQuery) {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    console.log(`[CombatPlugin] Raw data received: ${data}`); // Added log
    console.log(`Combat plugin handling callback: ${data} for user ${userId}`);

    if (data.startsWith('start_combat_')) {
      const monsterId = data.replace('start_combat_', '');
      const combat = this.gameEngine.startCombat(userId, monsterId);
      
      if (combat) {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Combat started!' });
        
        // Show combat status after a brief delay
        setTimeout(async () => {
          await this.showCombatStatus(callbackQuery.message.chat.id, userId);
        }, 500);
      } else {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Failed to start combat!' });
      }
      return true;
    }

    if (data === 'hunt_again') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.handleHunt({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      return true;
    }

    if (data === 'combat_attack') {
      await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Attacking...' });
      const result = this.gameEngine.performAttack(userId);
      
      if (result) {
        if (result.error) {
          await this.bot.sendMessage(callbackQuery.message.chat.id, `❌ ${result.error}`);
          return true;
        }
        await this.processCombatResult(callbackQuery.message.chat.id, userId, result);
      } else {
        await this.bot.sendMessage(callbackQuery.message.chat.id, '❌ Failed to attack!');
      }
      return true;
    }

    if (data === 'combat_defend') {
      await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Defending...' });
      const combat = this.gameEngine.getCombat(userId);
      
      const canDefend = combat && combat.turn === 'player' && 
        (!combat.isPartyBattle || combat.players[combat.currentPlayerIndex].id === userId);
      
      if (canDefend) {
        const currentPlayer = combat.isPartyBattle ? 
          combat.players[combat.currentPlayerIndex] : 
          combat.players[0];
          
        // Defending reduces incoming damage by 50%
        currentPlayer.defense *= 1.5;
        
        if (combat.isPartyBattle) {
          combat.currentPlayerIndex++;
          if (combat.currentPlayerIndex >= combat.players.length) {
            combat.currentPlayerIndex = 0;
            combat.turn = 'monster';
          }
        } else {
          combat.turn = 'monster';
        }
        
        // Monster's turn
        const result = this.gameEngine.performAttack(userId);
        if (result) {
          // Reset defense
          currentPlayer.defense /= 1.5;
          await this.processCombatResult(callbackQuery.message.chat.id, userId, result);
        }
      } else {
        await this.bot.sendMessage(callbackQuery.message.chat.id, '❌ Cannot defend now!');
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
          keyboard.inline_keyboard.push([
            { text: `💊 ${item.name}`, callback_data: `use_combat_item_${itemId}` }
          ]);
        }
      }

      if (keyboard.inline_keyboard.length === 0) {
        await this.bot.sendMessage(callbackQuery.message.chat.id, '❌ No usable items!');
        return true;
      }

      await this.bot.sendMessage(callbackQuery.message.chat.id,
        `💊 *Choose an item to use:*`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
      return true;
    }

    if (data.startsWith('use_combat_item_')) {
      const itemId = data.replace('use_combat_item_', '');
      const result = this.gameEngine.useItem(userId, itemId);

      // Always answer the callback query to remove the "loading" state
      await this.bot.answerCallbackQuery(callbackQuery.id);

      if (result.success) {
        // Send a message to the chat about the item used
        await this.bot.sendMessage(callbackQuery.message.chat.id, `✅ ${result.message}`);

        // Continue combat
        const combat = this.gameEngine.getCombat(userId);
        if (combat && combat.status === 'active') {
          combat.turn = 'monster';
          const attackResult = this.gameEngine.performAttack(userId);
          if (attackResult) {
            // Use a timeout to make the flow feel more natural
            setTimeout(async () => {
              await this.processCombatResult(callbackQuery.message.chat.id, userId, attackResult);
            }, 1500);
          }
        }
      } else {
        // Send a failure message to the chat
        await this.bot.sendMessage(callbackQuery.message.chat.id, `❌ ${result.message}`);
        // Show combat status again so the user can choose another action
        setTimeout(async () => {
            await this.showCombatStatus(callbackQuery.message.chat.id, userId);
        }, 500);
      }
      return true;
    }

    if (data === 'combat_run') {
      await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Attempting to run...' });
      const combat = this.gameEngine.getCombat(userId);
      
      if (combat && combat.isPartyBattle) {
        await this.bot.sendMessage(callbackQuery.message.chat.id,
          `❌ Cannot run from party battle! All party members must agree to retreat.`
        );
        return true;
      }
      
      const runChance = Math.random();
      
      if (runChance < 0.7) {
        this.gameEngine.endCombat(userId);
        await this.bot.sendMessage(callbackQuery.message.chat.id,
          `🏃 *You ran away from combat!*\n\nYou escaped safely.`
        );
      } else {
        // Monster gets a free attack (solo combat only)
        const result = this.gameEngine.performAttack(userId, 'attack');
        if (result) {
          await this.processCombatResult(callbackQuery.message.chat.id, userId, result);
        }
      }
      return true;
    }

    // If no specific callback was handled, return false
    return false;
  }
}

module.exports = CombatPlugin;