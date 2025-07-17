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
    if (args.length < 2) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Usage: /buy <shop_id> <item_id>
` +
        `Example: /buy weapon_shop iron_sword`
      );
      return;
    }

    const [shopId, itemId] = args;
    const itemTypes = ['consumable', 'etc', 'weapon', 'armor', 'accessory'];
    if (itemTypes.includes(itemId)) {
      await this.bot.sendMessage(msg.chat.id, `❌ Please specify a unique item ID, not a general item type (e.g., 'iron_sword' instead of 'weapon').`);
      return;
    }
    const item = this.db.getItem(itemId);

    if (!item) {
      await this.bot.sendMessage(msg.chat.id, `❌ Item not found!`);
      return;
    }

    if (item.type === 'consumable' || item.type === 'etc') {
      await this.askForQuantity(msg.chat.id, userId, 'buy', shopId, itemId);
    } else {
      await this.processBuy(msg.chat.id, userId, shopId, itemId, 1);
    }
  }

  async handleSell(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Usage: /sell <item_id>
` +
        `Example: /sell red_potion`
      );
      return;
    }

    const [itemId] = args;
    const itemTypes = ['consumable', 'etc', 'weapon', 'armor', 'accessory'];
    if (itemTypes.includes(itemId)) {
      await this.bot.sendMessage(msg.chat.id, `❌ Please specify a unique item ID, not a general item type (e.g., 'red_potion' instead of 'consumable').`);
      return;
    }
    const shop = this.db.getShopsByLocation(character.position.map)[0];
    if (!shop) {
      await this.bot.sendMessage(msg.chat.id, `❌ No shop found in your current location.`);
      return;
    }

    const item = this.db.getItem(itemId);
    if (!item) {
      await this.bot.sendMessage(msg.chat.id, `❌ Item not found!`);
      return;
    }

    if (item.type === 'consumable' || item.type === 'etc') {
      await this.askForQuantity(msg.chat.id, userId, 'sell', shop.id, itemId);
    } else {
      await this.processSell(msg.chat.id, userId, shop.id, itemId, 1);
    }
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

    // console.log(`[ShopPlugin] showShop: shopId=${shopId}, shop=${JSON.stringify(shop)}`);

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
      
      // console.log(`[ShopPlugin] shop.items: ${JSON.stringify(shop.items)}`);

      for (const shopItem of shop.items) {
        const item = this.db.getItem(shopItem.item);
        if (item) {
          const price = Math.floor(item.price * shop.buy_rate);
          const stockText = shopItem.stock === -1 ? '∞' : shopItem.stock;
          message += `• ${item.name} - ${price} Zeny (Stock: ${stockText})\n`;
          keyboard.inline_keyboard.push([
            { text: `💰 Buy ${item.name}`, callback_data: `shop_buy_${shopId}_${shopItem.item}` }
          ]);
        }
      }
    }

    if (shop.type === 'buy_sell' || shop.type === 'sell_only') {
      message += `\n💸 *You can sell items here*\n`;
      message += `Sell rate: ${Math.floor(shop.sell_rate * 100)}% of item value\n`;
      
      keyboard.inline_keyboard.push([
        { text: '💸 Sell Items', callback_data: `shop_sell_menu_${shop.id}` }
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

    const totalPrice = Math.floor(item.price * shop.buy_rate * quantity);
    
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

  async askForQuantity(chatId, userId, type, shopId, itemId) {
    const item = this.db.getItem(itemId);
    if (!item) {
      await this.bot.sendMessage(chatId, `❌ Item not found!`);
      return;
    }

    const typeText = type === 'buy' ? 'Buy' : 'Sell';
    let message = `🔢 *${typeText} ${item.name}*

`;
    message += `How many do you want to ${type.toLowerCase()}?`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '1', callback_data: `shop_quantity_${type}_${shopId}_${itemId}_1` },
          { text: '5', callback_data: `shop_quantity_${type}_${shopId}_${itemId}_5` },
          { text: '10', callback_data: `shop_quantity_${type}_${shopId}_${itemId}_10` },
          { text: '25', callback_data: `shop_quantity_${type}_${shopId}_${itemId}_25` },
        ],
        [
          { text: 'Cancel', callback_data: `shop_cancel_${type}_${shopId}` }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
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

    let message = `💸 *Sell Items to ${shop.name}*

`;
    message += `Sell rate: ${Math.floor(shop.sell_rate * 100)}%

`;

    const keyboard = { inline_keyboard: [] };

    for (const [itemId, quantity] of sellableItems) {
      const item = this.db.getItem(itemId);
      if (item) {
        const sellPrice = Math.floor(item.price * shop.sell_rate);
        message += `• ${item.name} x${quantity} - ${sellPrice} Zeny each
`;
        
        keyboard.inline_keyboard.push([
          { text: `💸 Sell ${item.name}`, callback_data: `shop_sell_${shopId}_${itemId}` }
        ]);
      }
    }

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async handleCallback(callbackQuery) {
    // console.log(`[ShopPlugin] handleCallback: Received callbackQuery.data: ${callbackQuery.data}`);
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (data.startsWith('shop_visit_')) {
      const shopId = data.replace('shop_visit_', '');
      await this.bot.answerCallbackQuery(callbackQuery.id, {});
      await this.showShop(callbackQuery.message.chat.id, userId, shopId);
      return true;
    }

    if (data.startsWith('shop_buy_')) {
      // console.log(`[ShopPlugin] handleCallback: shop_buy_ data: ${data}`);
      const remainingString = data.replace('shop_buy_', '');
      let shopId = '';
      let itemId = '';

      // Iterate through known shop IDs to find a match
      const allShops = this.db.getShops();
      for (const sId in allShops) {
        if (remainingString.startsWith(sId + '_')) {
          shopId = sId;
          itemId = remainingString.substring(sId.length + 1);
          break;
        }
      }

      if (!shopId || !itemId) {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Invalid callback data format or shop/item not found!' });
        return true;
      }
      // console.log(`[ShopPlugin] handleCallback: Extracted shopId: ${shopId}, itemId: ${itemId}`);
      
      const item = this.db.getItem(itemId);
      if (!item) {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Item not found!'});
        return true;
      }

      await this.bot.answerCallbackQuery(callbackQuery.id, {});
      if (item.type === 'consumable' || item.type === 'etc') {
        await this.askForQuantity(callbackQuery.message.chat.id, userId, 'buy', shopId, itemId);
      } else {
        await this.processBuy(callbackQuery.message.chat.id, userId, shopId, itemId, 1);
      }
      return true;
    }

    if (data.startsWith('shop_sell_menu_')) {
      const shopId = data.replace('shop_sell_menu_', '');
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.showSellMenu(callbackQuery.message.chat.id, userId, shopId);
      return true;
    }

    if (data.startsWith('shop_sell_')) {
      // console.log(`[ShopPlugin] handleCallback: shop_sell_ data: ${data}`);
      const remainingString = data.replace('shop_sell_', '');
      let shopId = '';
      let itemId = '';

      // Iterate through known shop IDs to find a match
      const allShops = this.db.getShops();
      for (const sId in allShops) {
        if (remainingString.startsWith(sId + '_')) {
          shopId = sId;
          itemId = remainingString.substring(sId.length + 1);
          break;
        }
      }

      if (!shopId || !itemId) {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Invalid callback data format or shop/item not found!' });
        return true;
      }
      // console.log(`[ShopPlugin] handleCallback: Extracted shopId: ${shopId}, itemId: ${itemId}`);

      const item = this.db.getItem(itemId);
      if (!item) {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Item not found!' });
        return true;
      }
      
      await this.bot.answerCallbackQuery(callbackQuery.id, {});
      if (item.type === 'consumable' || item.type === 'etc') {
        await this.askForQuantity(callbackQuery.message.chat.id, userId, 'sell', shopId, itemId);
      } else {
        await this.processSell(callbackQuery.message.chat.id, userId, shopId, itemId, 1);
      }
      return true;
    }
    
    if (data.startsWith('shop_quantity_')) {
      // console.log(`[ShopPlugin] handleCallback: shop_quantity_ data: ${data}`);
      const parts = data.replace('shop_quantity_', '').split('_');
      const type = parts[0];
      const quantity = parseInt(parts[parts.length - 1]);
      const remainingString = parts.slice(1, parts.length - 1).join('_');
      // console.log(`[ShopPlugin] handleCallback (shop_quantity_): type: ${type}, quantity: ${quantity}, remainingString: ${remainingString}`);

      let shopId = '';
      let itemId = '';

      // Iterate through known shop IDs to find a match
      const allShops = this.db.getShops();
      for (const sId in allShops) {
        if (remainingString.startsWith(sId + '_')) {
          shopId = sId;
          itemId = remainingString.substring(sId.length + 1);
          break;
        }
      }
      // console.log(`[ShopPlugin] handleCallback (shop_quantity_): Extracted shopId: ${shopId}, itemId: ${itemId}`);

      if (!shopId || !itemId) {
        // console.log(`[ShopPlugin] handleCallback (shop_quantity_): Invalid shopId or itemId. Answering callback with error.`);
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Invalid callback data format or shop/item not found!' });
        return true;
      }

      // console.log(`[ShopPlugin] handleCallback (shop_quantity_): Processing quantity for type: ${type}, shopId: ${shopId}, itemId: ${itemId}, quantity: ${quantity}`);
      if (type === 'buy') {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Processing purchase...' });
        await this.processBuy(callbackQuery.message.chat.id, userId, shopId, itemId, quantity);
      } else if (type === 'sell') {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Processing sale...' });
        await this.processSell(callbackQuery.message.chat.id, userId, shopId, itemId, quantity);
      }
      return true;
    }

    if (data.startsWith('shop_cancel_')) {
      // console.log(`[ShopPlugin] handleCallback: shop_cancel_ data: ${data}`);
      const remainingString = data.replace('shop_cancel_', '');
      const firstUnderscoreIndex = remainingString.indexOf('_');
      if (firstUnderscoreIndex === -1) {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Invalid callback data format!' });
        return true;
      }
      const type = remainingString.substring(0, firstUnderscoreIndex);
      const shopIdString = remainingString.substring(firstUnderscoreIndex + 1);

      let shopId = '';
      const allShops = this.db.getShops();
      for (const sId in allShops) {
        if (shopIdString === sId || shopIdString.startsWith(sId + '_')) {
          shopId = sId;
          break;
        }
      }

      if (!shopId) {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Invalid shop ID in callback data!' });
        return true;
      }

      // console.log(`[ShopPlugin] handleCallback (shop_cancel_): type: ${type}, shopId: ${shopId}`);

      await this.bot.answerCallbackQuery(callbackQuery.id, {});
      if (type === 'buy') {
        await this.showShop(callbackQuery.message.chat.id, userId, shopId);
      } else if (type === 'sell') {
        await this.showSellMenu(callbackQuery.message.chat.id, userId, shopId);
      }
      return true;
    }

    return false;
  }
}

module.exports = ShopPlugin;