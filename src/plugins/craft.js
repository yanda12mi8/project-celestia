class CraftPlugin {
  constructor(bot, db, gameEngine) {
    this.bot = bot;
    this.db = db;
    this.gameEngine = gameEngine;
    
    this.commands = {
      'craft': this.handleCraft,
      'brew': this.handleBrew,
      'recipes': this.handleRecipes,
      'craftinfo': this.handleCraftInfo
    };
  }

  async init() {
    console.log('Craft plugin initialized');
  }

  async handleCraft(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    // Check if in city
    if (!this.gameEngine.isInCity(character.position.map)) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You can only craft in cities!\n\n` +
        `Available cities: ${this.gameEngine.config.locations.cities.join(', ')}`
      );
      return;
    }
    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.showCraftMenu(msg.chat.id, 'crafting');
      return;
    }

    const recipeId = args[0];
    await this.processCrafting(msg.chat.id, userId, recipeId, 'crafting');
  }

  async handleBrew(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    // Check if in city
    if (!this.gameEngine.isInCity(character.position.map)) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You can only brew in cities!\n\n` +
        `Available cities: ${this.gameEngine.config.locations.cities.join(', ')}`
      );
      return;
    }
    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.showCraftMenu(msg.chat.id, 'brewing');
      return;
    }

    const recipeId = args[0];
    await this.processCrafting(msg.chat.id, userId, recipeId, 'brewing');
  }

  async handleRecipes(msg) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔨 Crafting Recipes', callback_data: 'recipes_crafting' },
          { text: '🧪 Brewing Recipes', callback_data: 'recipes_brewing' }
        ]
      ]
    };

    await this.bot.sendMessage(msg.chat.id,
      `📋 *Recipe Book*\n\n` +
      `Choose a category to view available recipes:`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  }

  async handleCraftInfo(msg) {
    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Please specify a recipe ID!\n\n` +
        `Usage: /craftinfo <recipe_id>\n` +
        `Example: /craftinfo iron_sword`
      );
      return;
    }

    const recipeId = args[0];
    await this.showRecipeInfo(msg.chat.id, recipeId);
  }

  async showCraftMenu(chatId, type) {
    const recipes = this.db.getRecipes();
    const typeRecipes = recipes[type] || {};
    
    if (Object.keys(typeRecipes).length === 0) {
      await this.bot.sendMessage(chatId,
        `📋 No ${type} recipes available!`
      );
      return;
    }

    let message = `🔨 *${type.charAt(0).toUpperCase() + type.slice(1)} Menu*\n\n`;
    const keyboard = { inline_keyboard: [] };

    for (const [id, recipe] of Object.entries(typeRecipes)) {
      message += `• ${recipe.name} (${id})\n`;
      keyboard.inline_keyboard.push([
        { text: `🔨 ${recipe.name}`, callback_data: `craft_${type}_${id}` },
        { text: `ℹ️ Info`, callback_data: `craft_info_${id}` }
      ]);
    }

    message += `\nSelect a recipe to craft or view info:`;

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async showRecipeInfo(chatId, recipeId) {
    const recipes = this.db.getRecipes();
    let recipe = null;
    let type = null;

    // Find recipe in both crafting and brewing
    if (recipes.crafting && recipes.crafting[recipeId]) {
      recipe = recipes.crafting[recipeId];
      type = 'crafting';
    } else if (recipes.brewing && recipes.brewing[recipeId]) {
      recipe = recipes.brewing[recipeId];
      type = 'brewing';
    }

    if (!recipe) {
      await this.bot.sendMessage(chatId,
        `❌ Recipe "${recipeId}" not found!`
      );
      return;
    }

    const resultItem = this.db.getItem(recipe.result.item);
    let message = `📋 *Recipe: ${recipe.name}*\n\n`;
    
    message += `🎯 *Result:* ${resultItem ? resultItem.name : recipe.result.item} x${recipe.result.quantity}\n`;
    message += `💰 *Cost:* ${recipe.zeny_cost} Zeny\n`;
    message += `⏱️ *Time:* ${recipe.craft_time || recipe.brew_time} seconds\n`;
    message += `📊 *Success Rate:* ${recipe.success_rate}%\n\n`;

    message += `📦 *Materials Required:*\n`;
    for (const material of recipe.materials) {
      const item = this.db.getItem(material.item);
      message += `• ${item ? item.name : material.item} x${material.quantity}\n`;
    }

    if (recipe.required_skill) {
      message += `\n🎯 *Required Skill:* ${recipe.required_skill} (Level ${recipe.skill_level})`;
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: `🔨 Craft ${recipe.name}`, callback_data: `craft_${type}_${recipeId}` }]
      ]
    };

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async processCrafting(chatId, userId, recipeId, type) {
    const character = this.gameEngine.getCharacter(userId);
    const recipes = this.db.getRecipes();
    const recipe = recipes[type] && recipes[type][recipeId];

    if (!recipe) {
      await this.bot.sendMessage(chatId,
        `❌ Recipe "${recipeId}" not found in ${type}!`
      );
      return;
    }

    // Check zeny cost
    if (character.inventory.zeny < recipe.zeny_cost) {
      await this.bot.sendMessage(chatId,
        `❌ Not enough Zeny! Required: ${recipe.zeny_cost}, You have: ${character.inventory.zeny}`
      );
      return;
    }

    // Check materials
    const missingMaterials = [];
    for (const material of recipe.materials) {
      const playerAmount = character.inventory.items[material.item] || 0;
      if (playerAmount < material.quantity) {
        const item = this.db.getItem(material.item);
        missingMaterials.push(`${item ? item.name : material.item} (need ${material.quantity}, have ${playerAmount})`);
      }
    }

    if (missingMaterials.length > 0) {
      await this.bot.sendMessage(chatId,
        `❌ *Missing Materials:*\n\n` +
        missingMaterials.map(m => `• ${m}`).join('\n'),
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Process crafting
    const success = Math.random() * 100 < recipe.success_rate;
    
    // Consume materials and zeny
    for (const material of recipe.materials) {
      character.inventory.items[material.item] -= material.quantity;
      if (character.inventory.items[material.item] <= 0) {
        delete character.inventory.items[material.item];
      }
    }
    character.inventory.zeny -= recipe.zeny_cost;

    if (success) {
      // Add result item
      this.gameEngine.addItemToInventory(userId, recipe.result.item, recipe.result.quantity);
      
      const resultItem = this.db.getItem(recipe.result.item);
      await this.bot.sendMessage(chatId,
        `✅ *${type.charAt(0).toUpperCase() + type.slice(1)} Successful!*\n\n` +
        `🎉 You crafted: ${resultItem ? resultItem.name : recipe.result.item} x${recipe.result.quantity}\n` +
        `💰 Cost: ${recipe.zeny_cost} Zeny`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await this.bot.sendMessage(chatId,
        `❌ *${type.charAt(0).toUpperCase() + type.slice(1)} Failed!*\n\n` +
        `The ${type} attempt failed. Materials and Zeny were consumed.\n` +
        `💰 Lost: ${recipe.zeny_cost} Zeny`,
        { parse_mode: 'Markdown' }
      );
    }

    this.gameEngine.updateCharacter(userId, character);
  }

  async handleCallback(callbackQuery) {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (data === 'recipes_crafting') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.showCraftMenu(callbackQuery.message.chat.id, 'crafting');
      return true;
    }

    if (data === 'recipes_brewing') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.showCraftMenu(callbackQuery.message.chat.id, 'brewing');
      return true;
    }

    if (data.startsWith('craft_info_')) {
      const recipeId = data.replace('craft_info_', '');
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.showRecipeInfo(callbackQuery.message.chat.id, recipeId);
      return true;
    }

    if (data.startsWith('craft_crafting_')) {
      const recipeId = data.replace('craft_crafting_', '');
      await this.bot.answerCallbackQuery(callbackQuery.id, 'Crafting...');
      await this.processCrafting(callbackQuery.message.chat.id, userId, recipeId, 'crafting');
      return true;
    }

    if (data.startsWith('craft_brewing_')) {
      const recipeId = data.replace('craft_brewing_', '');
      await this.bot.answerCallbackQuery(callbackQuery.id, 'Brewing...');
      await this.processCrafting(callbackQuery.message.chat.id, userId, recipeId, 'brewing');
      return true;
    }

    return false;
  }
}

module.exports = CraftPlugin;