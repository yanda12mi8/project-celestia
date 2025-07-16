# Ragnarok RPG Telegram Bot

A comprehensive text-based RPG game for Telegram with plugin architecture, inspired by classic MMORPG games like Ragnarok Online.

## Features

### Core Game Systems
- **Character Creation & Progression**: Create characters with different classes, level up, and allocate stat points
- **Combat System**: Turn-based combat with monsters, items, and strategic elements
- **Map System**: Grid-based world exploration with multiple areas and terrains
- **Inventory & Equipment**: Manage items, weapons, armor, and consumables
- **Guild System**: Create or join guilds for multiplayer interaction
- **Quest System**: Complete quests for rewards and progression

### Technical Features
- **Plugin Architecture**: Modular CommonJS plugin system with auto-loading
- **Database System**: File-based storage with JSON persistence
- **Real-time Multiplayer**: Support for multiple players simultaneously
- **Interactive UI**: Rich Telegram keyboard navigation
- **Error Handling**: Comprehensive error handling and logging

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your bot token:
   - Create a bot with @BotFather on Telegram
   - Get your bot token
   - Set the `BOT_TOKEN` environment variable or edit `index.js`

4. Run the bot:
   ```bash
   node index.js
   ```

## Game Commands

### Character Commands
- `/start` - Start the game
- `/create <name>` - Create your character
- `/status` - View character status
- `/stats` - View and upgrade stats
- `/inventory` - Check inventory
- `/equipment` - View equipment

### Map Commands
- `/map` - View current map
- `/move <direction>` - Move around (north/south/east/west)
- `/where` - Current location
- `/teleport <map>` - Teleport to map

### Combat Commands
- `/hunt` - Hunt for monsters
- `/attack` - Attack in combat
- `/combat` - View combat status

### Guild Commands
- `/guild` - Guild information
- `/gcreate <name>` - Create guild
- `/gjoin <name>` - Join guild
- `/gleave` - Leave guild
- `/gmembers` - View guild members
- `/gchat <message>` - Guild chat

### Help Commands
- `/help` - Show help system
- `/commands` - List all commands
- `/guide` - Game guide
- `/about` - About the game

## Plugin System

The bot uses a modular plugin architecture where each plugin is a CommonJS module that handles specific game features:

### Available Plugins
- `character.js` - Character creation and management
- `map.js` - Map exploration and movement
- `combat.js` - Combat system and monster hunting
- `guild.js` - Guild system and social features
- `help.js` - Help system and documentation

### Plugin Structure
```javascript
class MyPlugin {
  constructor(bot, db, gameEngine) {
    this.bot = bot;
    this.db = db;
    this.gameEngine = gameEngine;
    
    // Define commands handled by this plugin
    this.commands = {
      'mycommand': this.handleMyCommand
    };
  }

  async init() {
    // Plugin initialization
  }

  async handleMyCommand(msg) {
    // Command handler
  }

  async handleCallback(callbackQuery) {
    // Callback query handler
    return false; // Return true if handled
  }

  async middleware(msg, callbackQuery) {
    // Middleware for preprocessing
    return true; // Return false to stop processing
  }
}

module.exports = MyPlugin;
```

## Game Mechanics

### Character System
- **Classes**: Start as Novice, advance to specialized classes
- **Stats**: STR, AGI, VIT, INT, DEX, LUK
- **Leveling**: Gain EXP from combat and quests
- **Equipment**: Weapons, armor, and accessories

### Combat System
- **Turn-based**: Player and monster take turns
- **Actions**: Attack, defend, use items, or run
- **Damage**: Based on ATK vs DEF calculations
- **Rewards**: EXP, items, and Zeny

### Map System
- **Grid-based**: Navigate through tile-based maps
- **Terrain**: Different terrain types with obstacles
- **Monsters**: Random encounters and hunting
- **NPCs**: Quest givers and merchants

### Guild System
- **Creation**: Create guilds for 10,000 Zeny
- **Membership**: Join public guilds or get invited
- **Features**: Guild chat, treasury, and activities
- **Management**: Leader controls and member permissions

## Database Structure

The bot uses a file-based database with JSON storage:

```
data/
├── users.json          # User account data
├── characters.json     # Character data
├── guilds.json         # Guild information
├── items.json          # Item definitions
├── monsters.json       # Monster data
├── maps.json           # Map data
└── quests.json         # Quest definitions
```

## Development

### Adding New Features
1. Create a new plugin in `src/plugins/`
2. Implement the plugin class with required methods
3. The plugin will be automatically loaded on bot restart

### Customization
- Edit JSON files in `data/` to modify game content
- Add new items, monsters, maps, or quests
- Customize game balance and mechanics

### Error Handling
- Comprehensive error logging
- Graceful fallback for missing data
- User-friendly error messages

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the MIT License.

## Support

For support, feature requests, or bug reports, please create an issue in the repository.

---

**Enjoy your adventure in Midgard!** 🎮⚔️🏰