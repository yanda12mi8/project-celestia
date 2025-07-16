class AdminPlugin {
  constructor(bot, db, gameEngine) {
    this.bot = bot;
    this.db = db;
    this.gameEngine = gameEngine;
    
    // Load admin users from config
    this.adminUsers = new Set(this.gameEngine.config.admin.users || []);
    
    this.commands = {
      'admin': this.handleAdmin,
      'give': this.handleGive,
      'setlevel': this.handleSetLevel,
      'setzeny': this.handleSetZeny,
      'teleportuser': this.handleTeleportUser,
      'broadcast': this.handleBroadcast,
      'ban': this.handleBan,
      'unban': this.handleUnban,
      'serverstats': this.handleServerStats,
      'reloaddata': this.handleReloadData,
      'addadmin': this.handleAddAdmin,
      'removeadmin': this.handleRemoveAdmin
    };
  }

  async init() {
    console.log('Admin plugin initialized');
    // Load admin list from database if exists
    const adminData = this.db.getAdminData();
    if (adminData && adminData.admins) {
      // Merge config admins with database admins
      for (const adminId of adminData.admins) {
        this.adminUsers.add(adminId);
      }
    }
  }

  isAdmin(userId) {
    return this.adminUsers.has(userId);
  }

  async handleAdmin(msg) {
    const userId = msg.from.id;
    
    if (!this.isAdmin(userId)) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You don't have admin permissions!`
      );
      return;
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🎁 Give Items', callback_data: 'admin_give' },
          { text: '📊 Set Level', callback_data: 'admin_level' }
        ],
        [
          { text: '💰 Set Zeny', callback_data: 'admin_zeny' },
          { text: '🌐 Teleport User', callback_data: 'admin_teleport' }
        ],
        [
          { text: '📢 Broadcast', callback_data: 'admin_broadcast' },
          { text: '🚫 Ban/Unban', callback_data: 'admin_ban' }
        ],
        [
          { text: '📈 Server Stats', callback_data: 'admin_stats' },
          { text: '🔄 Reload Data', callback_data: 'admin_reload' }
        ],
        [
          { text: '👑 Manage Admins', callback_data: 'admin_manage' }
        ]
      ]
    };

    await this.bot.sendMessage(msg.chat.id,
      `👑 *Admin Panel*\n\n` +
      `Welcome to the admin control panel!\n` +
      `Select an action below:`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  }

  async handleGive(msg) {
    const userId = msg.from.id;
    
    if (!this.isAdmin(userId)) {
      await this.bot.sendMessage(msg.chat.id, `❌ Admin only command!`);
      return;
    }

    const args = msg.text.split(' ').slice(1);
    if (args.length < 3) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Usage: /give <user_id> <item_id> <quantity>\n` +
        `Example: /give 123456789 red_potion 10`
      );
      return;
    }

    const [targetUserId, itemId, quantity] = args;
    const targetCharacter = this.gameEngine.getCharacter(parseInt(targetUserId));
    const item = this.db.getItem(itemId);

    if (!targetCharacter) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ User ${targetUserId} not found or has no character!`
      );
      return;
    }

    if (!item) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Item "${itemId}" not found!`
      );
      return;
    }

    const qty = parseInt(quantity);
    this.gameEngine.addItemToInventory(parseInt(targetUserId), itemId, qty);

    await this.bot.sendMessage(msg.chat.id,
      `✅ *Item Given Successfully!*\n\n` +
      `👤 Target: ${targetCharacter.name}\n` +
      `🎁 Item: ${item.name} x${qty}`,
      { parse_mode: 'Markdown' }
    );

    // Notify the target user
    try {
      await this.bot.sendMessage(parseInt(targetUserId),
        `🎁 *Admin Gift Received!*\n\n` +
        `You received: ${item.name} x${qty}\n` +
        `From: Game Administrator`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.log(`Could not notify user ${targetUserId}`);
    }
  }

  async handleSetLevel(msg) {
    const userId = msg.from.id;
    
    if (!this.isAdmin(userId)) {
      await this.bot.sendMessage(msg.chat.id, `❌ Admin only command!`);
      return;
    }

    const args = msg.text.split(' ').slice(1);
    if (args.length < 2) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Usage: /setlevel <user_id> <level>\n` +
        `Example: /setlevel 123456789 50`
      );
      return;
    }

    const [targetUserId, level] = args;
    const targetCharacter = this.gameEngine.getCharacter(parseInt(targetUserId));

    if (!targetCharacter) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ User ${targetUserId} not found or has no character!`
      );
      return;
    }

    const newLevel = parseInt(level);
    if (newLevel < 1 || newLevel > 99) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Level must be between 1 and 99!`
      );
      return;
    }

    const oldLevel = targetCharacter.level;
    targetCharacter.level = newLevel;
    targetCharacter.exp = 0;
    targetCharacter.expToNext = Math.floor(100 * Math.pow(1.2, newLevel - 1));
    
    // Adjust stats based on level
    const levelDiff = newLevel - oldLevel;
    targetCharacter.stats.maxHp += levelDiff * 10;
    targetCharacter.stats.maxSp += levelDiff * 5;
    targetCharacter.stats.hp = targetCharacter.stats.maxHp;
    targetCharacter.stats.sp = targetCharacter.stats.maxSp;
    targetCharacter.statusPoints += levelDiff * 3;

    this.gameEngine.updateCharacter(parseInt(targetUserId), targetCharacter);

    await this.bot.sendMessage(msg.chat.id,
      `✅ *Level Set Successfully!*\n\n` +
      `👤 Target: ${targetCharacter.name}\n` +
      `📊 Level: ${oldLevel} → ${newLevel}`,
      { parse_mode: 'Markdown' }
    );

    // Notify the target user
    try {
      await this.bot.sendMessage(parseInt(targetUserId),
        `📊 *Level Updated by Admin!*\n\n` +
        `Your level has been set to: ${newLevel}\n` +
        `Previous level: ${oldLevel}`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.log(`Could not notify user ${targetUserId}`);
    }
  }

  async handleSetZeny(msg) {
    const userId = msg.from.id;
    
    if (!this.isAdmin(userId)) {
      await this.bot.sendMessage(msg.chat.id, `❌ Admin only command!`);
      return;
    }

    const args = msg.text.split(' ').slice(1);
    if (args.length < 2) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Usage: /setzeny <user_id> <amount>\n` +
        `Example: /setzeny 123456789 1000000`
      );
      return;
    }

    const [targetUserId, amount] = args;
    const targetCharacter = this.gameEngine.getCharacter(parseInt(targetUserId));

    if (!targetCharacter) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ User ${targetUserId} not found or has no character!`
      );
      return;
    }

    const newAmount = parseInt(amount);
    if (newAmount < 0) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Amount must be positive!`
      );
      return;
    }

    const oldAmount = targetCharacter.inventory.zeny;
    targetCharacter.inventory.zeny = newAmount;
    this.gameEngine.updateCharacter(parseInt(targetUserId), targetCharacter);

    await this.bot.sendMessage(msg.chat.id,
      `✅ *Zeny Set Successfully!*\n\n` +
      `👤 Target: ${targetCharacter.name}\n` +
      `💰 Zeny: ${oldAmount} → ${newAmount}`,
      { parse_mode: 'Markdown' }
    );

    // Notify the target user
    try {
      await this.bot.sendMessage(parseInt(targetUserId),
        `💰 *Zeny Updated by Admin!*\n\n` +
        `Your Zeny has been set to: ${newAmount}\n` +
        `Previous amount: ${oldAmount}`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.log(`Could not notify user ${targetUserId}`);
    }
  }

  async handleBroadcast(msg) {
    const userId = msg.from.id;
    
    if (!this.isAdmin(userId)) {
      await this.bot.sendMessage(msg.chat.id, `❌ Admin only command!`);
      return;
    }

    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Usage: /broadcast <message>\n` +
        `Example: /broadcast Server maintenance in 30 minutes!`
      );
      return;
    }

    const message = args.join(' ');
    const users = this.db.getAllUsers();
    let sentCount = 0;

    const broadcastMessage = `📢 *Server Announcement*\n\n${message}`;

    for (const userId of users.keys()) {
      try {
        await this.bot.sendMessage(parseInt(userId), broadcastMessage, { parse_mode: 'Markdown' });
        sentCount++;
      } catch (error) {
        console.log(`Could not send broadcast to user ${userId}`);
      }
    }

    await this.bot.sendMessage(msg.chat.id,
      `✅ *Broadcast Sent!*\n\n` +
      `📤 Sent to: ${sentCount} users\n` +
      `📝 Message: ${message}`,
      { parse_mode: 'Markdown' }
    );
  }

  async handleServerStats(msg) {
    const userId = msg.from.id;
    
    if (!this.isAdmin(userId)) {
      await this.bot.sendMessage(msg.chat.id, `❌ Admin only command!`);
      return;
    }

    const users = this.db.getAllUsers();
    const characters = this.db.getAllCharacters();
    const guilds = this.db.getAllGuilds();

    let totalLevel = 0;
    let maxLevel = 0;
    let activeUsers = 0;
    const jobCounts = {};

    for (const character of characters.values()) {
      totalLevel += character.level;
      maxLevel = Math.max(maxLevel, character.level);
      
      if (character.lastLogin > Date.now() - 24 * 60 * 60 * 1000) {
        activeUsers++;
      }

      jobCounts[character.class] = (jobCounts[character.class] || 0) + 1;
    }

    const avgLevel = characters.size > 0 ? Math.floor(totalLevel / characters.size) : 0;

    let message = `📈 *Server Statistics*\n\n`;
    message += `👥 Total Users: ${users.size}\n`;
    message += `👤 Total Characters: ${characters.size}\n`;
    message += `🏛️ Total Guilds: ${guilds.size}\n`;
    message += `🟢 Active (24h): ${activeUsers}\n\n`;
    message += `📊 *Level Stats:*\n`;
    message += `📈 Average Level: ${avgLevel}\n`;
    message += `🏆 Highest Level: ${maxLevel}\n\n`;
    message += `🎭 *Job Distribution:*\n`;
    
    for (const [job, count] of Object.entries(jobCounts)) {
      message += `• ${job}: ${count}\n`;
    }

    await this.bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
  }

  async handleAddAdmin(msg) {
    const userId = msg.from.id;
    
    if (!this.isAdmin(userId)) {
      await this.bot.sendMessage(msg.chat.id, `❌ Admin only command!`);
      return;
    }

    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Usage: /addadmin <user_id>\n` +
        `Example: /addadmin 123456789`
      );
      return;
    }

    const newAdminId = parseInt(args[0]);
    this.adminUsers.add(newAdminId);
    
    // Save to database
    this.db.setAdminData({ admins: Array.from(this.adminUsers) });

    await this.bot.sendMessage(msg.chat.id,
      `✅ *Admin Added Successfully!*\n\n` +
      `👑 New Admin: ${newAdminId}`,
      { parse_mode: 'Markdown' }
    );

    // Notify the new admin
    try {
      await this.bot.sendMessage(newAdminId,
        `👑 *You are now an Admin!*\n\n` +
        `You have been granted administrator privileges.\n` +
        `Use /admin to access the admin panel.`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.log(`Could not notify new admin ${newAdminId}`);
    }
  }

  async handleRemoveAdmin(msg) {
    const userId = msg.from.id;
    
    if (!this.isAdmin(userId)) {
      await this.bot.sendMessage(msg.chat.id, `❌ Admin only command!`);
      return;
    }

    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Usage: /removeadmin <user_id>\n` +
        `Example: /removeadmin 123456789`
      );
      return;
    }

    const removeAdminId = parseInt(args[0]);
    
    if (removeAdminId === userId) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You cannot remove yourself as admin!`
      );
      return;
    }

    this.adminUsers.delete(removeAdminId);
    
    // Save to database
    this.db.setAdminData({ admins: Array.from(this.adminUsers) });

    await this.bot.sendMessage(msg.chat.id,
      `✅ *Admin Removed Successfully!*\n\n` +
      `👤 Removed Admin: ${removeAdminId}`,
      { parse_mode: 'Markdown' }
    );
  }

  async handleReloadData(msg) {
    const userId = msg.from.id;
    
    if (!this.isAdmin(userId)) {
      await this.bot.sendMessage(msg.chat.id, `❌ Admin only command!`);
      return;
    }

    try {
      await this.db.init();
      await this.bot.sendMessage(msg.chat.id,
        `✅ *Data Reloaded Successfully!*\n\n` +
        `All game data has been reloaded from files.`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ *Error Reloading Data!*\n\n` +
        `${error.message}`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  async handleCallback(callbackQuery) {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (!this.isAdmin(userId)) {
      await this.bot.answerCallbackQuery(callbackQuery.id, 'Admin only!');
      return true;
    }

    if (data === 'admin_give') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.bot.sendMessage(callbackQuery.message.chat.id,
        `🎁 *Give Items*\n\n` +
        `Usage: /give <user_id> <item_id> <quantity>\n` +
        `Example: /give 123456789 red_potion 10\n\n` +
        `Use /items to see available item IDs.`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    if (data === 'admin_stats') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.handleServerStats({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      return true;
    }

    if (data === 'admin_reload') {
      await this.bot.answerCallbackQuery(callbackQuery.id, 'Reloading data...');
      await this.handleReloadData({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      return true;
    }

    return false;
  }
}

module.exports = AdminPlugin;