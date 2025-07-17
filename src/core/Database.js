const fs = require('fs-extra');
const path = require('path');
const { randomUUID } = require('crypto');

class Database {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data');
    this.users = new Map();
    this.characters = new Map();
    this.guilds = new Map();
    this.items = {};
    this.monsters = new Map();
    this.maps = new Map();
    this.quests = new Map();
    this.recipes = new Map();
    this.jobs = new Map();
    this.shops = new Map();
    this.adminData = null;
  }

  async init() {
    // Ensure data directory exists
    await fs.ensureDir(this.dataDir);
    
    // Load all data
    await this.loadUsers();
    await this.loadCharacters();
    await this.loadGuilds();
    await this.loadItems();
    await this.loadMonsters();
    await this.loadMaps();
    await this.loadQuests();
    await this.loadRecipes();
    await this.loadJobs();
    await this.loadShops();
    await this.loadAdminData();
  }

  async loadUsers() {
    const usersFile = path.join(this.dataDir, 'users.json');
    try {
      if (await fs.pathExists(usersFile)) {
        const data = await fs.readJSON(usersFile);
        this.users = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async saveUsers() {
    const usersFile = path.join(this.dataDir, 'users.json');
    try {
      const data = Object.fromEntries(this.users);
      await fs.writeJSON(usersFile, data, { spaces: 2 });
    } catch (error) {
      console.error('Error saving users:', error);
    }
  }

  async loadCharacters() {
    const charactersFile = path.join(this.dataDir, 'characters.json');
    try {
      if (await fs.pathExists(charactersFile)) {
        const data = await fs.readJSON(charactersFile);
        this.characters = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('Error loading characters:', error);
    }
  }

  async saveCharacters() {
    const charactersFile = path.join(this.dataDir, 'characters.json');
    try {
      const data = Object.fromEntries(this.characters);
      await fs.writeJSON(charactersFile, data, { spaces: 2 });
    } catch (error) {
      console.error('Error saving characters:', error);
    }
  }

  async loadGuilds() {
    const guildsFile = path.join(this.dataDir, 'guilds.json');
    try {
      if (await fs.pathExists(guildsFile)) {
        const data = await fs.readJSON(guildsFile);
        this.guilds = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('Error loading guilds:', error);
    }
  }

  async saveGuilds() {
    const guildsFile = path.join(this.dataDir, 'guilds.json');
    try {
      const data = Object.fromEntries(this.guilds);
      await fs.writeJSON(guildsFile, data, { spaces: 2 });
    } catch (error) {
      console.error('Error saving guilds:', error);
    }
  }

  async loadItems() {
    const itemsFile = path.join(this.dataDir, 'items.json');
    try {
      if (await fs.pathExists(itemsFile)) {
        const data = await fs.readJSON(itemsFile);
        this.items = data; // Assign the entire grouped data
      } else {
        // Initialize default items if file doesn't exist
        await this.initializeDefaultItems();
      }
    } catch (error) {
      console.error('Error loading items:', error);
    }
  }

  async loadMonsters() {
    const monstersFile = path.join(this.dataDir, 'monsters.json');
    try {
      if (await fs.pathExists(monstersFile)) {
        const data = await fs.readJSON(monstersFile);
        this.monsters = new Map(Object.entries(data));
      } else {
        // Initialize default monsters
        await this.initializeDefaultMonsters();
      }
    } catch (error) {
      console.error('Error loading monsters:', error);
    }
  }

  async loadMaps() {
    const mapsFile = path.join(this.dataDir, 'maps.json');
    try {
      if (await fs.pathExists(mapsFile)) {
        const data = await fs.readJSON(mapsFile);
        this.maps = new Map(Object.entries(data));
      } else {
        // Initialize default maps
        await this.initializeDefaultMaps();
      }
    } catch (error) {
      console.error('Error loading maps:', error);
    }
  }

  async loadRecipes() {
    const recipesFile = path.join(this.dataDir, 'recipes.json');
    const expandedRecipesPath = path.join(this.dataDir, '../data/expanded_recipes.json');
    
    try {
      if (await fs.pathExists(recipesFile)) {
        const data = await fs.readJSON(recipesFile);
        this.recipes = data;
      } else if (await fs.pathExists(expandedRecipesPath)) {
        // Load expanded recipes if main file doesn't exist
        this.recipes = await fs.readJSON(expandedRecipesPath);
        await this.saveRecipes(); // Save to main location
      } else {
        this.recipes = { crafting: {}, brewing: {} };
      }
    } catch (error) {
      console.error('Error loading recipes:', error);
      this.recipes = { crafting: {}, brewing: {} };
    }
  }

  async loadJobs() {
    const jobsFile = path.join(this.dataDir, 'jobs.json');
    try {
      if (await fs.pathExists(jobsFile)) {
        const data = await fs.readJSON(jobsFile);
        this.jobs = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
  }

  async loadShops() {
    const shopsFile = path.join(this.dataDir, 'shops.json');
    const expandedShopsPath = path.join(this.dataDir, '../data/expanded_shops.json');
    
    try {
      if (await fs.pathExists(shopsFile)) {
        const data = await fs.readJSON(shopsFile);
        this.shops = new Map(Object.entries(data));
      } else if (await fs.pathExists(expandedShopsPath)) {
        // Load expanded shops if main file doesn't exist
        const data = await fs.readJSON(expandedShopsPath);
        this.shops = new Map(Object.entries(data));
        await this.saveShops(); // Save to main location
      } else {
        this.shops = new Map();
      }
    } catch (error) {
      console.error('Error loading shops:', error);
      this.shops = new Map();
    }
  }

  async loadAdminData() {
    const adminFile = path.join(this.dataDir, 'admin.json');
    try {
      if (await fs.pathExists(adminFile)) {
        this.adminData = await fs.readJSON(adminFile);
      }
    } catch (error) {
      console.error('Error loading admin data:', error);
    }
  }

  async loadQuests() {
    const questsFile = path.join(this.dataDir, 'quests.json');
    try {
      if (await fs.pathExists(questsFile)) {
        const data = await fs.readJSON(questsFile);
        this.quests = new Map(Object.entries(data));
      } else {
        // Initialize default quests
        await this.initializeDefaultQuests();
      }
    } catch (error) {
      console.error('Error loading quests:', error);
    }
  }

  async initializeDefaultItems() {
    // Load expanded items from file
    const expandedItemsPath = path.join(this.dataDir, '../data/expanded_items.json');
    let defaultItems = {};
    
    try {
      if (await fs.pathExists(expandedItemsPath)) {
        defaultItems = await fs.readJSON(expandedItemsPath);
      }
    } catch (error) {
      console.error('Error loading expanded items:', error);
      // Fallback to basic items
      defaultItems = {
        'consumable': {
          'red_potion': {
            id: 'red_potion',
            name: 'Red Potion',
            type: 'consumable',
            description: 'Restores 50 HP',
            price: 50,
            effect: { hp: 50 }
          }
        }
      };
    }

    for (const type in defaultItems) {
      for (const itemId in defaultItems[type]) {
        this.items[type] = this.items[type] || {};
        this.items[type][itemId] = defaultItems[type][itemId];
      }
    }
    
    await this.saveItems();
  }

  async initializeDefaultMonsters() {
    // Load expanded monsters from file
    const expandedMonstersPath = path.join(this.dataDir, '../data/expanded_monsters.json');
    let defaultMonsters = {};
    
    try {
      if (await fs.pathExists(expandedMonstersPath)) {
        defaultMonsters = await fs.readJSON(expandedMonstersPath);
      }
    } catch (error) {
      console.error('Error loading expanded monsters:', error);
      // Fallback to basic monsters
      defaultMonsters = {
        'poring': {
          id: 'poring',
          name: 'Poring',
          level: 1,
          hp: 30,
          attack: 5,
          defense: 1,
          exp: 10,
          drops: ['red_potion']
        }
      };
    }

    for (const [id, monster] of Object.entries(defaultMonsters)) {
      this.monsters.set(id, monster);
    }
    
    await this.saveMonsters();
  }

  async initializeDefaultMaps() {
    const defaultMaps = {
      'prontera': {
        id: 'prontera',
        name: 'Prontera',
        width: 20,
        height: 20,
        spawn: { x: 10, y: 10 },
        tiles: this.generateMapTiles(20, 20),
        monsters: ['poring', 'drops'],
        npcs: ['healer', 'merchant']
      },
      'geffen': {
        id: 'geffen',
        name: 'Geffen',
        width: 18,
        height: 18,
        spawn: { x: 9, y: 9 },
        tiles: this.generateMapTiles(18, 18),
        monsters: ['skeleton', 'zombie'],
        npcs: ['magic_dealer', 'librarian']
      },
      'payon': {
        id: 'payon',
        name: 'Payon',
        width: 16,
        height: 16,
        spawn: { x: 8, y: 8 },
        tiles: this.generateMapTiles(16, 16),
        monsters: ['wolf', 'bear'],
        npcs: ['general_merchant', 'elder']
      },
      'alberta': {
        id: 'alberta',
        name: 'Alberta',
        width: 22,
        height: 22,
        spawn: { x: 11, y: 11 },
        tiles: this.generateMapTiles(22, 22),
        monsters: [],
        npcs: ['port_trader', 'sailor']
      },
      'training_ground': {
        id: 'training_ground',
        name: 'Training Ground',
        width: 15,
        height: 15,
        spawn: { x: 1, y: 1 },
        tiles: this.generateDungeonTiles(15, 15),
        monsters: ['poring', 'drops', 'goblin'],
        npcs: []
      }
    };

    for (const [id, map] of Object.entries(defaultMaps)) {
      this.maps.set(id, map);
    }
    
    await this.saveMaps();
  }

  async initializeDefaultQuests() {
    const defaultQuests = {
      'first_quest': {
        id: 'first_quest',
        name: 'First Steps',
        description: 'Kill 5 Porings',
        requirements: { kill: { poring: 5 } },
        rewards: { exp: 100, items: ['potion'] },
        level: 1
      }
    };

    for (const [id, quest] of Object.entries(defaultQuests)) {
      this.quests.set(id, quest);
    }
    
    await this.saveQuests();
  }

  generateMapTiles(width, height) {
    const tiles = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        // Generate random terrain
        const rand = Math.random();
        if (rand < 0.1) {
          row.push('tree');
        } else if (rand < 0.2) {
          row.push('water');
        } else {
          row.push('grass');
        }
      }
      tiles.push(row);
    }
    return tiles;
  }

  generateDungeonTiles(width, height) {
    const tiles = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          row.push('wall');
        } else {
          const rand = Math.random();
          if (rand < 0.2) {
            row.push('wall');
          } else {
            row.push('floor');
          }
        }
      }
      tiles.push(row);
    }
    return tiles;
  }

  async saveItems() {
    const itemsFile = path.join(this.dataDir, 'items.json');
    try {
      await fs.writeJSON(itemsFile, this.items, { spaces: 2 });
    } catch (error) {
      console.error('Error saving items:', error);
    }
  }

  async saveMonsters() {
    const monstersFile = path.join(this.dataDir, 'monsters.json');
    try {
      const data = Object.fromEntries(this.monsters);
      await fs.writeJSON(monstersFile, data, { spaces: 2 });
    } catch (error) {
      console.error('Error saving monsters:', error);
    }
  }

  async saveMaps() {
    const mapsFile = path.join(this.dataDir, 'maps.json');
    try {
      const data = Object.fromEntries(this.maps);
      await fs.writeJSON(mapsFile, data, { spaces: 2 });
    } catch (error) {
      console.error('Error saving maps:', error);
    }
  }

  async saveQuests() {
    const questsFile = path.join(this.dataDir, 'quests.json');
    try {
      const data = Object.fromEntries(this.quests);
      await fs.writeJSON(questsFile, data, { spaces: 2 });
    } catch (error) {
      console.error('Error saving quests:', error);
    }
  }

  // User methods
  getUser(userId) {
    return this.users.get(userId.toString());
  }

  setUser(userId, userData) {
    this.users.set(userId.toString(), userData);
    this.saveUsers();
  }

  // Character methods
  getCharacter(userId) {
    return this.characters.get(userId.toString());
  }

  setCharacter(userId, characterData) {
    this.characters.set(userId.toString(), characterData);
    this.saveCharacters();
  }

  // Guild methods
  getGuild(guildId) {
    return this.guilds.get(guildId);
  }

  setGuild(guildId, guildData) {
    this.guilds.set(guildId, guildData);
    this.saveGuilds();
  }

  // Item methods
  getItem(itemId) {
    console.log(`[Database] getItem: Searching for itemId: '${itemId}'`);
    console.log(`[Database] getItem: Current items structure keys: ${Object.keys(this.items).join(', ')}`);
    for (const type in this.items) {
      console.log(`[Database] getItem: Checking type: '${type}'`);
      if (this.items[type][itemId]) {
        console.log(`[Database] getItem: Found item '${itemId}' in type '${type}'`);
        return this.items[type][itemId];
      }
    }
    console.log(`[Database] getItem: Item '${itemId}' not found in any type.`);
    return null;
  }

  getAllItems() {
    let allItems = [];
    for (const type in this.items) {
      allItems = allItems.concat(Object.values(this.items[type]));
    }
    return allItems;
  }

  // Monster methods
  getMonster(monsterId) {
    return this.monsters.get(monsterId);
  }

  getAllMonsters() {
    return Array.from(this.monsters.values());
  }

  // Map methods
  getMap(mapId) {
    return this.maps.get(mapId);
  }

  getAllMaps() {
    return Array.from(this.maps.values());
  }

  // Quest methods
  getQuest(questId) {
    return this.quests.get(questId);
  }

  getAllQuests() {
    return Array.from(this.quests.values());
  }

  // Recipe methods
  getRecipes() {
    return this.recipes;
  }

  // Job methods
  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  getAllJobs() {
    return Array.from(this.jobs.values());
  }

  // Shop methods
  getShop(shopId) {
    const shop = this.shops.get(shopId);
    return shop;
  }

  setShop(shopId, shopData) {
    this.shops.set(shopId, shopData);
    this.saveShops();
  }

  getShops() {
    return Object.fromEntries(this.shops);
  }

  getShopsByLocation(location) {
    return Array.from(this.shops.values()).filter(shop => shop.location === location);
  }

  async saveShops() {
    const shopsFile = path.join(this.dataDir, 'shops.json');
    try {
      const data = Object.fromEntries(this.shops);
      await fs.writeJSON(shopsFile, data, { spaces: 2 });
    } catch (error) {
      console.error('Error saving shops:', error);
    }
  }

  // Admin methods
  getAdminData() {
    return this.adminData;
  }

  setAdminData(data) {
    this.adminData = data;
    this.saveAdminData();
  }

  async saveAdminData() {
    const adminFile = path.join(this.dataDir, 'admin.json');
    try {
      await fs.writeJSON(adminFile, this.adminData, { spaces: 2 });
    } catch (error) {
      console.error('Error saving admin data:', error);
    }
  }

  async saveRecipes() {
    const recipesFile = path.join(this.dataDir, 'recipes.json');
    try {
      await fs.writeJSON(recipesFile, this.recipes, { spaces: 2 });
    } catch (error) {
      console.error('Error saving recipes:', error);
    }
  }

  // Helper methods for admin
  getAllUsers() {
    return this.users;
  }

  getAllCharacters() {
    return this.characters;
  }

  getAllGuilds() {
    return this.guilds;
  }
}

module.exports = Database;