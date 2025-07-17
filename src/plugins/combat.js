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

    const playerHpBar = this.createHealthBar(combat.player.hp, combat.player.maxHp);
    const monsterHpBar = this.createHealthBar(combat.monster.hp, combat.monster.maxHp);

    await this.bot.sendMessage(chatId,
      `⚔️ *Combat Status*\n\n` +
      `👤 *${combat.player.name}*\n` +
      `❤️ HP: ${playerHpBar} ${combat.player.hp}/${combat.player.maxHp}\n` +
      `⚔️ Attack: ${combat.player.attack}\n` +
      `🛡️ Defense: ${combat.player.defense}\n\n` +
      `👹 *${combat.monster.name}*\n` +
      `❤️ HP: ${monsterHpBar} ${combat.monster.hp}/${combat.monster.maxHp}\n` +
      `⚔️ Attack: ${combat.monster.attack}\n` +
      `🛡️ Defense: ${combat.monster.defense}\n\n` +
      `🎯 Turn: ${combat.turn === 'player' ? 'Your turn!' : 'Monster\'s turn'}\n\n` +
      `${combat.turn === 'player' ? 'Choose your action:' : 'Waiting for monster...'}`,
      { parse_mode: 'Markdown', reply_markup: combat.turn === 'player' ? keyboard : undefined }
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
    const { combat, results } = result;
    
    let message = '⚔️ *Combat Round*\n\n';
    
    for (const res of results) {
      if (res.type === 'attack') {
        message += `💥 ${res.attacker} attacks ${res.target} for ${res.damage} damage!\n`;
      } else if (res.type === 'critical') {
        message += `💥 *CRITICAL HIT!* ${res.attacker} attacks ${res.target} for ${res.damage} damage!\n`;
      } else if (res.type === 'evade') {
        message += `💨 ${res.target} evaded the attack from ${res.attacker}!\n`;
      } else if (res.type === 'victory') {
        message += `\n🎉 *Victory!*\n`;
        message += `You defeated the ${combat.monster.name}!\n`;
      } else if (res.type === 'defeat') {
        message += `\n💀 *Defeat!*\n`;
        message += `You were defeated by the ${combat.monster.name}!\n`;
        message += `You lost some experience and were revived with 1 HP...`;
      } else if (res.type === 'rewards') {
        const rewards = res.rewards;
        if (rewards.exp > 0) {
          message += `✨ Gained ${rewards.exp} EXP!\n`;
        } else if (rewards.exp < 0) {
          message += `💀 Lost ${Math.abs(rewards.exp)} EXP!\n`;
        }
        
        if (rewards.zeny > 0) {
          message += `💰 Found ${rewards.zeny} Zeny!\n`;
        }
        
        if (rewards.items.length > 0) {
          message += `🎁 *Items obtained:*\n`;
          for (const item of rewards.items) {
            message += `• ${item.name} x${item.quantity}\n`;
          }
        }
        
        if (rewards.levelUp) {
          message += `\n🎉 *LEVEL UP!* You are now stronger!\n`;
        }
      }
    }

    await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    if (combat.status === 'active') {
      // Show updated combat status
      setTimeout(() => {
        this.showCombatStatus(chatId, userId);
      }, 2000);
    }
  }

  async handleCallback(callbackQuery) {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
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
        await this.processCombatResult(callbackQuery.message.chat.id, userId, result);
      } else {
        await this.bot.sendMessage(callbackQuery.message.chat.id, '❌ Failed to attack!');
      }
      return true;
    }

    if (data === 'combat_defend') {
      await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Defending...' });
      const combat = this.gameEngine.getCombat(userId);
      
      if (combat && combat.turn === 'player') {
        // Defending reduces incoming damage by 50%
        combat.player.defense *= 1.5;
        combat.turn = 'monster';
        
        // Monster's turn
        const result = this.gameEngine.performAttack(userId);
        if (result) {
          // Reset defense
          combat.player.defense /= 1.5;
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
      const runChance = Math.random();
      
      if (runChance < 0.7) {
        this.gameEngine.endCombat(userId);
        await this.bot.sendMessage(callbackQuery.message.chat.id,
          `🏃 *You ran away from combat!*\n\nYou escaped safely.`
        );
      } else {
        // Monster gets a free attack
        const result = this.gameEngine.performAttack(userId);
        if (result) {
          await this.processCombatResult(callbackQuery.message.chat.id, userId, result);
        }
      }
      return true;
    }

    return false;
  }
}

module.exports = CombatPlugin;