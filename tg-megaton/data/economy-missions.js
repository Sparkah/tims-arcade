window.MEGATON_ECONOMY_CONFIG = {
  "version": 1,
  "dropTables": {
    "standard": {
      "common": 0.68,
      "rare": 0.23,
      "epic": 0.07,
      "legendary": 0.018,
      "mythic": 0.002
    },
    "caps": {
      "common": 0.62,
      "rare": 0.27,
      "epic": 0.08,
      "legendary": 0.026,
      "mythic": 0.004
    },
    "premium": {
      "common": 0.0,
      "rare": 0.78,
      "epic": 0.16,
      "legendary": 0.052,
      "mythic": 0.008
    },
    "legendary_plus": {
      "common": 0.0,
      "rare": 0.0,
      "epic": 0.0,
      "legendary": 0.9,
      "mythic": 0.1
    },
    "weekly": {
      "common": 0.0,
      "rare": 0.76,
      "epic": 0.17,
      "legendary": 0.06,
      "mythic": 0.01
    }
  },
  "boxes": {
    "daily": {
      "rolls": 1,
      "dropTable": "standard"
    },
    "ad": {
      "rolls": 1,
      "dropTable": "standard"
    },
    "caps": {
      "rolls": 1,
      "dropTable": "caps",
      "caps": 750
    },
    "premium_1": {
      "rolls": 1,
      "dropTable": "premium"
    },
    "premium_10": {
      "rolls": 10,
      "dropTable": "premium"
    },
    "legendary_1": {
      "rolls": 1,
      "dropTable": "legendary_plus"
    },
    "mission_reward": {
      "rolls": 1,
      "dropTable": "standard"
    },
    "weekly_reward": {
      "rolls": 1,
      "dropTable": "weekly"
    }
  },
  "weeklyRewards": [
    {
      "label": "Top 1",
      "min": 1,
      "max": 1,
      "crates": 10
    },
    {
      "label": "Top 2",
      "min": 2,
      "max": 2,
      "crates": 8
    },
    {
      "label": "Top 3",
      "min": 3,
      "max": 3,
      "crates": 6
    },
    {
      "label": "Top 4-10",
      "min": 4,
      "max": 10,
      "crates": 3
    },
    {
      "label": "Top 11-20",
      "min": 11,
      "max": 20,
      "crates": 2
    },
    {
      "label": "Top 21-100",
      "min": 21,
      "max": 100,
      "crates": 1
    }
  ],
  "duplicateSell": {
    "common": 0.5,
    "rare": 1,
    "epic": 1.5,
    "legendary": 2,
    "mythic": 3
  },
  "missions": [
    {
      "id": "follow_main_channel",
      "type": "follow_link",
      "title": "Follow Megaton updates",
      "desc": "Open the Telegram channel, then claim the launch reward.",
      "url": "https://t.me/gamesfactorybot",
      "reward": {
        "caps": 750,
        "crates": 1,
        "boxId": "mission_reward"
      },
      "repeatable": false,
      "cooldownMs": 0,
      "firstShareBox": false,
      "repeatCapsFactor": 0
    },
    {
      "id": "share_game_friend",
      "type": "share_game",
      "title": "Share Megaton",
      "desc": "Send Megaton to a friend. First share gives a crate, then hourly shares give caps.",
      "url": "",
      "reward": {
        "caps": 0,
        "crates": 1,
        "boxId": "mission_reward"
      },
      "repeatable": true,
      "cooldownMs": 3600000,
      "firstShareBox": true,
      "repeatCapsFactor": 0.1
    }
  ]
};
