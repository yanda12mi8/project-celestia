class ShopPlugin {
  constructor(bot, db, gameEngine) {
    this.bot = bot;
    this.db = db;
    this.gameEngine = gameEngine;
    
    this.commands = {
      'shop': this.handleShop,
      'buy': this.handleBuy,
      'sell': this.handleSell,
      'shops': this.handleShops
    };
  }

  async init() {
    console.log('Shop plugin initialized');
  }

  async handleShop(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.showNearbyShops(msg.chat.id, character);
      return;
    }

    const shopId = args[0];
    await this.showShop(msg.chat.id, userId, shopId);
  }

  async handleBuy(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    const args = msg.text.split(' ').slice(1);
    if (args.length < 3) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Usage: /buy <shop_id> <item_id> <quantity>\n` +
        `Example: /buy weapon_shop sword 1`
      );
      return;
    }

    const [shopId, itemId, quantity] = args;
    await this.processBuy(msg.chat.id, userId, shopId, itemId, parseInt(quantity));
  }

  async handleSell(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    const args = msg.text.split(' ').slice(1);
    if (args.length < 3) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Usage: /sell <shop_id> <item_id> <quantity>\n` +
        `Example: /sell weapon_shop jellopy 10`
      );
      return;
    }

    const [shopId, itemId, quantity] = args;
    await this.processSell(msg.chat.id, userId, shopId, itemId, parseInt(quantity));
  }

  async handleShops(msg) {
    const shops = this.db.getShops();
    let message = `🏪 *Available Shops*\n\n`;

    for (const [id, shop] of Object.entries(shops)) {
      message += `🏪 **${shop.name}** (${id})\n`;
      message += `   📍 Location: ${shop.location}\n`;
      message += `   👤 NPC: ${shop.npc}\n`;
      message += `   📦 Type: ${shop.type}\n\n`;
    }

    await this.bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
  }

  async showNearbyShops(chatId, character) {
    // Check if in city
    if (!this.gameEngine.isInCity(character.position.map)) {
      await this.bot.sendMessage(chatId,
        `🏪 No shops available in this area!\n\n` +
        `Shops are only available in cities: ${this.gameEngine.config.locations.cities.join(', ')}`
      );
      return;
    }

    const shops = this.db.getShops();
    const nearbyShops = Object.values(shops).filter(shop => 
      shop.location === character.position.map
    );

    if (nearbyShops.length === 0) {
      await this.bot.sendMessage(chatId,
        `🏪 No shops available in this city!\nTry visiting other cities.`
      );
      return;
    }

    let message = `🏪 *Nearby Shops*\n\n`;
    const keyboard = { inline_keyboard: [] };

    for (const shop of nearbyShops) {
      message += `🏪 **${shop.name}**\n`;
      message += `   👤 ${shop.npc}\n`;
      message += `   📦 ${shop.type}\n\n`;
      
      keyboard.inline_keyboard.push([
        { text: `🛒 Visit ${shop.name}`, callback_data: `shop_visit_${shop.id}` }
      ]);
    }

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async showShop(chatId, userId, shopId) {
    const character = this.gameEngine.getCharacter(userId);
    const shop = this.db.getShop(shopId);

    if (!shop) {
      await this.bot.sendMessage(chatId,
        `❌ Shop "${shopId}" not found!`
      );
      return;
    }

    // Check if player is in the right location
    if (shop.location !== character.position.map) {
      await this.bot.sendMessage(chatId,
        `❌ You need to be in ${shop.location} to access this shop!`
      );
      return;
    }

    // Check requirements
    if (shop.requirements) {
      if (shop.requirements.level && character.level < shop.requirements.level) {
        await this.bot.sendMessage(chatId,
          `❌ You need to be level ${shop.requirements.level} to access this shop!`
        );
        return;
      }
    }

    let message = `🏪 *${shop.name}*\n`;
    message += `👤 NPC: ${shop.npc}\n`;
    message += `💰 Your Zeny: ${character.inventory.zeny}\n\n`;

    const keyboard = { inline_keyboard: [] };

    if (shop.type === 'buy_sell' || shop.type === 'buy_only') {
      message += `🛒 *Items for Sale:*\n`;
      
      for (const shopItem of shop.items) {
        const item = this.db.getItem(shopItem.item);
        if (item) {
          const price = Math.floor(shopItem.price * shop.buy_rate);
          const stockText = shopItem.stock === -1 ? '∞' : shopItem.stock;
          message += `• ${item.name} - ${price} Zeny (Stock: ${stockText})\n`;
          
          keyboard.inline_keyboard.push([
            { text: `💰 Buy ${item.name}`, callback_data: `shop_buy_${shopId}_${shopItem.item}_1` }
          ]);
        }
      }
    }

    if (shop.type === 'buy_sell' || shop.type === 'sell_only') {
      message += `\n💸 *You can sell items here*\n`;
      message += `Sell rate: ${Math.floor(shop.sell_rate * 100)}% of item value\n`;
      
      keyboard.inline_keyboard.push([
        { text: '💸 Sell Items', callback_data: `shop_sell_menu_${shopId}` }
      ]);
    }

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async processBuy(chatId, userId, shopId, itemId, quantity) {
    const character = this.gameEngine.getCharacter(userId);
    const shop = this.db.getShop(shopId);
    const item = this.db.getItem(itemId);

    if (!shop || !item) {
      await this.bot.sendMessage(chatId, `❌ Shop or item not found!`);
      return;
    }

    const shopItem = shop.items.find(si => si.item === itemId);
    if (!shopItem) {
      await this.bot.sendMessage(chatId, `❌ Item not available in this shop!`);
      return;
    }

    if (shopItem.stock !== -1 && shopItem.stock < quantity) {
      await this.bot.sendMessage(chatId,
        `❌ Not enough stock! Available: ${shopItem.stock}`
      );
      return;
    }

    const totalPrice = Math.floor(shopItem.price * shop.buy_rate * quantity);
    
    if (character.inventory.zeny < totalPrice) {
      await this.bot.sendMessage(chatId,
        `❌ Not enough Zeny! Required: ${totalPrice}, You have: ${character.inventory.zeny}`
      );
      return;
    }

    // Process purchase
    character.inventory.zeny -= totalPrice;
    this.gameEngine.addItemToInventory(userId, itemId, quantity);
    
    // Update shop stock
    if (shopItem.stock !== -1) {
      shopItem.stock -= quantity;
      this.db.setShop(shopId, shop);
    }

    await this.bot.sendMessage(chatId,
      `✅ *Purchase Successful!*\n\n` +
      `🛒 Bought: ${item.name} x${quantity}\n` +
      `💰 Total Cost: ${totalPrice} Zeny\n` +
      `💰 Remaining Zeny: ${character.inventory.zeny}`,
      { parse_mode: 'Markdown' }
    );

    this.gameEngine.updateCharacter(userId, character);
  }

  async processSell(chatId, userId, shopId, itemId, quantity) {
    const character = this.gameEngine.getCharacter(userId);
    const shop = this.db.getShop(shopId);
    const item = this.db.getItem(itemId);

    if (!shop || !item) {
      await this.bot.sendMessage(chatId, `❌ Shop or item not found!`);
      return;
    }

    if (shop.type === 'buy_only') {
      await this.bot.sendMessage(chatId, `❌ This shop doesn't buy items!`);
      return;
    }

    const playerAmount = character.inventory.items[itemId] || 0;
    if (playerAmount < quantity) {
      await this.bot.sendMessage(chatId,
        `❌ Not enough items! You have: ${playerAmount}`
      );
      return;
    }

    const totalPrice = Math.floor(item.price * shop.sell_rate * quantity);
    
    // Process sale
    character.inventory.items[itemId] -= quantity;
    if (character.inventory.items[itemId] <= 0) {
      delete character.inventory.items[itemId];
    }
    character.inventory.zeny += totalPrice;

    await this.bot.sendMessage(chatId,
      `✅ *Sale Successful!*\n\n` +
      `💸 Sold: ${item.name} x${quantity}\n` +
      `💰 Total Earned: ${totalPrice} Zeny\n` +
      `💰 Current Zeny: ${character.inventory.zeny}`,
      { parse_mode: 'Markdown' }
    );

    this.gameEngine.updateCharacter(userId, character);
  }

  async showSellMenu(chatId, userId, shopId) {
    const character = this.gameEngine.getCharacter(userId);
    const shop = this.db.getShop(shopId);

    if (!shop) return;

    const sellableItems = Object.entries(character.inventory.items).filter(([itemId, quantity]) => {
      const item = this.db.getItem(itemId);
      return item && quantity > 0;
    });

    if (sellableItems.length === 0) {
      await this.bot.sendMessage(chatId,
        `📦 You have no items to sell!`
      );
      return;
    }

    let message = `💸 *Sell Items to ${shop.name}*\n\n`;
    message += `Sell rate: ${Math.floor(shop.sell_rate * 100)}%\n\n`;

    const keyboard = { inline_keyboard: [] };

    for (const [itemId, quantity] of sellableItems) {
      const item = this.db.getItem(itemId);
      if (item) {
        const sellPrice = Math.floor(item.price * shop.sell_rate);
        message += `• ${item.name} x${quantity} - ${sellPrice} Zeny each\n`;
        
        keyboard.inline_keyboard.push([
          { text: `💸 Sell ${item.name}`, callback_data: `shop_sell_${shopId}_${itemId}_1` }
        ]);
      }
    }

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async handleCallback(callbackQuery) {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (data.startsWith('shop_visit_')) {
      const shopId = data.replace('shop_visit_', '');
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.showShop(callbackQuery.message.chat.id, userId, shopId);
      return true;
    }

    if (data.startsWith('shop_buy_')) {
      const parts = data.replace('shop_buy_', '').split('_');
      const shopId = parts[0];
      const itemId = parts[1];
      const quantity = parseInt(parts[2]);
      
      await this.bot.answerCallbackQuery(callbackQuery.id, 'Processing purchase...');
      await this.processBuy(callbackQuery.message.chat.id, userId, shopId, itemId, quantity);
      return true;
    }

    if (data.startsWith('shop_sell_menu_')) {
      const shopId = data.replace('shop_sell_menu_', '');
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.showSellMenu(callbackQuery.message.chat.id, userId, shopId);
      return true;
    }

    if (data.startsWith('shop_sell_')) {
      const parts = data.replace('shop_sell_', '').split('_');
      const shopId = parts[0];
      const itemId = parts[1];
      const quantity = parseInt(parts[2]);
      
      await this.bot.answerCallbackQuery(callbackQuery.id, 'Processing sale...');
      await this.processSell(callbackQuery.message.chat.id, userId, shopId, itemId, quantity);
      return true;
    }

    return false;
  }
}

module.exports = ShopPlugin;