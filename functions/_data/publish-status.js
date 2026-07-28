export default {
  "generated": "2026-07-27T19:47:40.398766+00:00",
  "core_platforms": [
    "yandex",
    "crazygames",
    "gamedistribution",
    "gamepush"
  ],
  "games": {
    "merge_conquest": {
      "gameDir": "Games/7-merge-conquest",
      "engagement": null,
      "platforms": {
        "yandex": {
          "url": "https://yandex.com/games/app/525693",
          "approvedOn": "2026-03-20",
          "status": "removed",
          "notes": [
            "[2026-06-16] Re-verified the rejected UPDATE draft (525693): deployed v21 (srcFile 11737487) PASSES yandex-testing 16/0/0 incl rewarded-no-freeze + fullscreen-no-freeze + platform-pause-no-lock (the 1.3/4.7/4.5 reject reasons). build=checked, can_send=true. SUBMIT-READY, no change needed; awaiting Tim's Submit click. Local index.html has newer uncommitted WIP = a FUTURE update, not this draft.",
            "[2026-06-19] live-stats: ~5 players/day (FADING; 14d tail [...,2,14,11,1]); time/player 4.72min; GameReady 1.15s; desktop4/mobile1. Alerts: may be hidden from catalog + add IAP. [2026-07-26] REMOVED from Yandex (app 525693 returns 404); gallery link auto-removed by link-reaper."
          ]
        },
        "crazygames": {
          "url": "https://www.crazygames.com/game/battle-merge",
          "approvedOn": "2026-04-05",
          "rejectedOn": "2026-06-05",
          "status": "removed",
          "notes": [
            "[2026-06-05] CrazyGames: was PUBLISHED/live, then DROPPED by CG for not passing playtime/retention metrics (KPI bar). Benchmark data: see notes/benchmarks - pull exact playtime/D1/CTR from CG analytics."
          ]
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "built",
          "notes": [
            "Zip ready at builds/merge_conquest-gamepush-v1.zip."
          ]
        }
      },
      "other": null,
      "readyPlatforms": [
        "gamedistribution",
        "gamepush"
      ],
      "notes": [
        "STATE OF THE ART."
      ]
    },
    "spore_guard": {
      "gameDir": "Games/4_Spore",
      "engagement": null,
      "platforms": {
        "yandex": {
          "url": "https://yandex.com/games/app/493910",
          "submittedOn": "2026-05-20",
          "approvedOn": "2026-06-06",
          "status": "live",
          "notes": [
            "[2026-06-22] CORRECTION: the leaderboards-page 'Submit' button = submit-whole-draft-to-moderation (NOT a save). Clicking it re-submitted the draft (still OLD build 11688992) to moderation and did NOT save the leaderboard. So: draft is in moderation again with the old build; leaderboard NOT created; IAP intact (app-level); live game unaffected. FIX: withdraw again -> add leaderboard properly (no page-Submit) -> swap v11 -> Tim does the real Submit.",
            "[2026-06-22] [2026-06-22] v11 SWAPPED INTO DRAFT 493910 (build 11793542 = checked) after Tim withdrew it from moderation. Leaderboard 'score' present; IAPs remove_ads+biomass_boost live. Changelog updated to v11 (RU+EN). yandex-testing on the v11 zip: 13 PASS / 0 FAIL / 3 non-blocking WARN. Draft fill 95% (only optional keywords missing), icon+cover present, 2 screenshots. READY for Tim's one click 'Submit for moderation' (I do NOT click it). Draft URL: https://games.yandex.ru/console/application/493910#application-info-draft"
          ]
        },
        "crazygames": {
          "rejectedOn": "2026-06-05",
          "status": "built",
          "notes": [
            "[2026-06-22] [2026-06-22] Codex review caught 2 issues, both FIXED: (1) crazygames-presubmit HARD-failed (no static CG SDK tag) - the adapter loaded the SDK dynamically; added <script src=sdk.crazygames.com/crazygames-sdk-v3.js> to the CG build index.html (adapter detects pre-loaded SDK + skips injection), presubmit now fails=0. (2) CG leaderboards+IAP are invite-only, so the build's leaderboard/store are Yandex-only and degrade to empty on CG; softened the CG description to not over-promise them. Re-uploaded as FRESH draft 6f0adf52 (spore-guard-voz); prior b10f5b67 deleted. fill_details_art: 3 covers + landscape+portrait video attached via form, REACHED SUBMIT STEP, 0 console errors, ART OK. Awaiting Tim's 'Submit for approval'.",
            "[2026-06-22] [2026-06-22] ROOT CAUSE of the recurring 'covers/videos not filled' block: CrazyGames keeps uploaded art in FORM-STATE only; the Details form never rehydrates it on reload (gameCovers + API developerSubmissionUpdateArt both persist server-side, verified via me{submissions}, but the form still shows empty Upload slots). Submit validates form-state, so a fresh/reloaded tab = empty slots + dead Submit. FIX: fill_details_art now polls until Submit ENABLES, foregrounds the live tab, and prints ACTION REQUIRED (+ --submit to auto-click); SKILL.md documents it. Draft 6f0adf52 is loaded in the foreground tab with Submit ENABLED + consent checked - Tim clicks it there (no reload)."
          ]
        },
        "gamedistribution": {
          "status": "submitted",
          "notes": [
            "[2026-06-04] Corrected live->submitted: no public URL was ever recorded and Tim states spore_guard is not published. Set a real URL + status=live only when GD actually approves it."
          ]
        },
        "gamepush": {
          "status": "built",
          "notes": [
            "GP 28723: draft build v1 uploaded to Game Hosting + public-zone listing filled via API (title/descs/cats arcade+shooter+tower-defense/tags survival+roguelike/engine js-runtime/age 0+/EN+RU)."
          ]
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamepush"
      ],
      "notes": [
        "React + Vite + Tailwind."
      ]
    },
    "creature_hunt": {
      "gameDir": "Games/10_running_away",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-09",
          "rejectedOn": "2026-06-06",
          "status": "submitted",
          "notes": [
            "[2026-06-09] [2026-06-09] Fixed v5 build (11686537, HUD reparented, ui_reachability PASS) is on the draft, NOT yet resubmitted (rejected_count still 3). In cooldown until 2026-06-09 21:12 UTC; Tim will resubmit after cooldown resets.",
            "[2026-06-11] [2026-06-11 console probe] RESUBMITTED: draft v2 in moderation (Waiting for moderation) since 2026-06-09 21:48 UTC; prior rejected status superseded"
          ]
        },
        "crazygames": {
          "submittedOn": "2026-05-26",
          "rejectedOn": "2026-06-05",
          "status": "rejected",
          "notes": [
            "[2026-06-05] CG console: REJECTED (terminal per game-id)"
          ]
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "gamedistribution",
        "gamepush"
      ],
      "notes": [
        "Multiplayer, server-authoritative on Render (wss://running-away.onrender.com)."
      ]
    },
    "merge_guns": {
      "gameDir": "Games/13_merge_guns",
      "engagement": null,
      "platforms": {
        "yandex": {
          "url": "https://yandex.com/games/app/526142",
          "approvedOn": "2026-05-14",
          "status": "live",
          "notes": [
            "[2026-06-28] Tim withdrew the in-moderation IAP update draft; agent swapped in the fuller ANIMATED build (index_combined source: merge juice + animated monster sprites + animated villager knight/elf/wizard sprites + procedural music + IAP; GameAnalytics stripped; 106 sprite frames). Localized the new skin/arsenal UI for 8.2.3 (EQUIPPED/DMG/GOLD/RATE/CRIT/'to every' -> RU \u041d\u0410\u0414\u0415\u0422\u041e/\u0423\u0420\u041e\u041d/\u0417\u041e\u041b\u041e\u0422\u041e/\u0421\u041a\u041e\u0420./\u041a\u0420\u0418\u0422/\u043a\u043e \u0432\u0441\u0435\u043c). sources=11849952 checked; draft icon set to the live ABT-accepted A-mascot file 11718077 (prevents icon rollback on publish); app-version 0.0.0.2; fill 90%; can_send=true. Gates: presubmit (only the 4.7 audio false-positive [mutes via _muted -> musGain.gain=0 + _play() early-return, same as live] + pre-existing emoji/font WARNs); exact-zip yandex-testing 16/0/0; deployed S3 bytes verified (spawnMergeShock + RU keys + ownsVIP present, 0 console.*, 0 analytics tags, goblin_run/human_...",
            "[2026-06-29] Tim SUBMITTED the v0.0.0.2 animated build to moderation (draft.status=checking, build checked, fill 90%). Separately Tim flagged the menu FREE CRATE: +10 cores DID grant but the confirmation toast drew at gameplay coords (DIVIDER_X/LANE_W) = off-screen in the menu, so it read as 'nothing happened'. FIXED: prominent centered _menuReward banner shown in the menu after the reward (verified cores 0->10 + banner renders + RU fits; yandex-testing 16/0/0). This fix is NOT in the in-moderation build; staged in builds/merge_guns-yandex-animated.zip for the NEXT update (recommend letting the current build finish rather than re-rolling the queue - it already fixed the worse free-crate dump-to-gameplay). Icon A/B (A-mascot vs Commando) ARMED + still open, awaiting Tim's Submit (abtState none)."
          ]
        },
        "crazygames": {
          "submittedOn": "2026-05-25",
          "rejectedOn": "2026-06-22",
          "status": "rejected",
          "notes": [
            "[2026-06-22] Live CG portal probe (Apollo me.submissions): submission e4da7859 (merge-guns-lph) status=REJECTED. The 2026-06-15 resubmit bounced; was tracked 'awaiting review'. CG terminal per game-id."
          ]
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "built",
          "notes": [
            "[2026-06-19] 2026-06-18 UPDATE: cracked the Vuetify pickers via the GraphQL updateProjectInfo mutation (UI was unautomatable). Public Zone now COMPLETE + saved: Engine=javaScript-runtime, Age=6+, Categories=[action,arcade,casual], Tags+Keywords=[merge,survival,idle,military,2d]. Remaining = the Distribution submit (Tim): accept distribution agreement (unaccepted), tick multi-language, Select platforms = VK Play/WG Playground/GameDistribution/Kongregate/GameMonetize ONLY (NOT Yandex/Playgama/CG), then Send for moderation."
          ]
        }
      },
      "other": {
        "playgama": {
          "status": "rejected",
          "notes": [
            "[2026-06-22] Live Playgama dashboard probe: Merge Guns = Rejected."
          ]
        }
      },
      "readyPlatforms": [
        "gamedistribution",
        "gamepush"
      ],
      "notes": [
        "Has the full game-art-pipeline assets."
      ]
    },
    "donut_reverse": {
      "gameDir": "Games/16_donut_reverse",
      "engagement": null,
      "platforms": {
        "yandex": {
          "url": "https://yandex.com/games/app/528397",
          "approvedOn": "2026-06-06",
          "rejectedOn": "2026-05-22",
          "status": "removed",
          "notes": [
            "[2026-06-14] Retention/monetization update uploaded to existing live-app draft after analytics pull (Donut DAU ~126, D1 weak, revenue collapsed Jun 7->13). Draft app-version=2, source file=11737407, source=checked, fill=90%, draft.status=checking. Local exact-zip yandex-testing PASS 16/0/0/0; real https://yandex.com/games/app/528397?draft=true smoke PASS (menu->play, src/game.js?v=36, __gfReach present, stuck platform pause clears on tap). RU draft copy corrected: removed WASD/Enter/R/M/F hotkey text and 3D-\u0430\u0440\u043a\u0430\u0434\u0430. Agent did not click final moderation submit; console currently reports checking.",
            "[2026-06-19] live-stats: ~25 players/day (peaked 241, declining); time/player 1.93min (short); GameReady 15.8s (HIGH/slow boot - investigate); desktop20/mobile5. Alert: add IAP. [2026-07-26] REMOVED from Yandex (app 528397 returns 404); gallery card hidden (external-only, no local runtime)."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": [
        "Evil Donut / \u0414\u044c\u044f\u0432\u043e\u043b\u044c\u0441\u043a\u0438\u0439 \u041f\u043e\u043d\u0447\u0438\u043a."
      ]
    },
    "daily_dodge": {
      "gameDir": "Games/21_dodge_run",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-22",
          "rejectedOn": "2026-06-13",
          "status": "submitted",
          "notes": [
            "[2026-06-16] Re-checked rejection: 8.2.3 RU text already clean, 1.10.1 menu skins fit. BUT 1.10.3 NOT fixed - in-game SCORE label overlapped the mute button (mobile+desktop). FIXED in drawHUD(): reserve compact-mute footprint during PLAYING so SCORE shifts left. Rebuilt daily-dodge-yandex-v13.zip, yandex-testing 13 pass/0 fail, uploaded to draft (srcFile 11749800, build=checked, can_send=true). Verified deployed bytes contain muteReserve + no overlap in fresh shots. SUBMIT-READY; awaiting Tim Submit.",
            "[2026-06-22] Console UI confirms 'Status of draft: Waiting for moderation' as of 2026-06-22 (screenshot-verified for Daily Dodge 530258; identical console draft-state 'checking' for these). You submitted it since the prior 'awaiting your click' note; exact submit date unknown. Reconciled to submitted."
          ]
        },
        "crazygames": {
          "status": "built"
        },
        "gamedistribution": {
          "status": "built"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": {
        "gamepix": {
          "status": "submitted",
          "notes": [
            "[2026-07-03] v2 build (GamePix.on.pause/resume/soundOff/soundOn audio wiring + loaded-promise rewarded path) uploaded into the ORIGINAL daily-dodge entity per GamePix instruction and submitted; badge REVIEW, version 3FzEAW2ldb2zYNeBvt7f8M2rtLD. History: 06-28 rejected (rewarded ad + assets), 06-30 resubmitted w/o full audio fix -> rejected; 07-01 session mistakenly resubmitted the DEAD duplicate daily-dodge-resubmission (EA2R5S) -> rejected as duplicate 07-02. Duplicate is abandoned; support removal pending (Tim email)."
          ]
        }
      },
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": [
        "Top engagement on game-factory.tech (14 plays / 4 likes)."
      ]
    },
    "arms_dealer": {
      "gameDir": "Games/15_donut_launcher (arms.html)",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-22",
          "rejectedOn": "2026-06-06",
          "status": "submitted",
          "notes": [
            "[2026-06-21] Rejected again (read from console): \u043f.1.8 mobile text unreadable/elements too small + \u043f.1.15 arsenal non-interactive after battle. FIXED in v7 (arms.html): UI-scale fonts + fitText (1.8), part-shop draw/tap rect single-source (1.15 desync), build-header overlap removed (1.10.3), + merge_guns-style 2D battle animations (Tim's ask). presubmit PASS, yandex-testing 16/16, EN+RU portrait+landscape screenshots verified. Build 11785571 pushed to draft (checked, missing_fields []), deployed bytes grep-verified. Cooldown reset 2026-06-08 (past). AWAITING TIM: click Submit for moderation.",
            "[2026-06-22] Console UI confirms 'Status of draft: Waiting for moderation' as of 2026-06-22 (screenshot-verified for Daily Dodge 530258; identical console draft-state 'checking' for these). You submitted it since the prior 'awaiting your click' note; exact submit date unknown. Reconciled to submitted."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": [
        "Hand-built Tower-defense / parts-assembly hybrid."
      ]
    },
    "clean_sweep": {
      "gameDir": "Games/17_clean_sweep",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-22",
          "rejectedOn": "2026-06-13",
          "status": "submitted",
          "notes": [
            "[2026-06-16] Re-checked rejection: 8.3.3 icon was NOT fixed - re-uploaded icon STILL had baked rounded corners + border (pixel-verified). FIXED: regenerated flat full-bleed 512 from the cover, uploaded (icon 11749809); deployed icon now full-bleed (topedge-dark-run 1px). Also found+fixed a 1.10.3 risk: hardcoded ENGLISH 'drag to move' hint overlapped the 'next tool' pill -> localized t('dragHint') + raised above pill. Rebuilt clean-sweep-yandex-v7.zip (srcFile 11749803, build=checked), removed WASD from RU desc+instruction (8.2.3 insurance). 1.15/1.10.1 verified OK (field fills frame, pieces reachable). can_send=true. SUBMIT-READY; awaiting Tim Submit.",
            "[2026-06-22] Console UI confirms 'Status of draft: Waiting for moderation' as of 2026-06-22 (screenshot-verified for Daily Dodge 530258; identical console draft-state 'checking' for these). You submitted it since the prior 'awaiting your click' note; exact submit date unknown. Reconciled to submitted."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "approvedOn": "2026-06-24",
          "status": "live",
          "notes": [
            "GamePush hosting live; VK distribution blocked on distribution agreement."
          ]
        }
      },
      "other": {
        "gamepix": {
          "status": "live",
          "url": "https://www.gamepix.com/play/clean-sweep-donut",
          "notes": [
            "[2026-07-03] LIVE (namespace clean-sweep-donut), approved 2026-06-29; the 06-29 SDK release draft was approved and absorbed \u2014 no open draft. Untouched by the 07-03 cleanup."
          ]
        },
        "youtube": {
          "status": "submitted",
          "notes": [
            "[2026-07-27] [2026-07-27] REJECTED by MCPlay superadmin 2026-07-27 on three points, all fixed and resubmitted the same day (v1.0.2, sha256 bafb093e55849af67f44df7633383c1506ef82f61f30e019cc65472698f3373b, 691,642 bytes). (1) No level save: the game persisted skills/coins/stars/best but never the LEVEL, so reload replayed the tutorial from level 1 and RETRY restarted at level 1. Added clean_sweep_progress_v1 written on level reached AND cleared; menu shows CONTINUE Lv N with a start-over link; RETRY and __GF_AUTOSTART resume at the last level; tutorial no longer replays. (2) Element overlap on the level-complete screen (stars over SCORE, NEW BEST and +sprinkles over the NEXT button, TIME BONUS float bleeding through) plus the same latent defect on game-over (streak+seed+NEW BEST+chain stacked on the title): both screens rebuilt as measured vertical stacks. (3) Unclear boost unlocks: locke...",
            "[2026-07-27] [2026-07-27b] SECOND CUT, same day. An adversarial self-review of the fix found two defects in it, so the submitted build was withdrawn (build_updated is locked; POST /withdraw returns it to pending), corrected, fully re-gated and resubmitted. Final archive sha256 59012e21316e4b0eb75b380c1750d822a9074a427ad1aa8b2bbbfe36b9e5ba53 (691,823 bytes), state review/review. (a) The rewarded boost-unlock let a player skip the ENTIRE playtime ladder: toolUnlockLoading only blocks concurrent requests, so after each grant the next boost immediately offered its own chip and ~7 back-to-back ads unlocked all 8 boosts. Now gated on adUnlockableTool() - offered only from HALFWAY to that boost's playtime requirement, re-checked at click time - which is what Mediacube actually asked for (open boosts 'chut ranshe', a bit earlier). (b) drawOverlay used min(max(clearance,floor),ceil) for its butto..."
          ]
        }
      },
      "readyPlatforms": [
        "crazygames",
        "gamedistribution"
      ],
      "notes": [
        "Gallery winner: 17 plays / 5\ud83d\udc4d 0\ud83d\udc4e / cleaning genre (100% positive ratio in 7d window)."
      ]
    },
    "merge_cleaners": {
      "gameDir": "Games/89_merge_cleaners",
      "engagement": null,
      "platforms": {
        "yandex": {
          "status": "built",
          "notes": [
            "Yandex zip rebuilt 2026-05-23 (294K, 14 files) with F4 fix (5x4 seed corrected from 6x4)."
          ]
        },
        "crazygames": {
          "status": "built",
          "notes": [
            "CG build folder at builds/merge_cleaners-crazygames-v1/."
          ]
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "yandex",
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": [
        "merge_guns reskin (cleaning theme)."
      ]
    },
    "ice_cleanup": {
      "gameDir": "Games/18_ice_cleanup",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-22",
          "rejectedOn": "2026-06-13",
          "status": "submitted",
          "notes": [
            "[2026-06-16] Re-checked rejection: 1.10.1 grid clipping FIXED - grid fills viewport mobile+desktop, icon full-bleed. Build unchanged (already good, srcFile 11730879, build=checked). Only change: removed Latin 'WASD' from RU instruction field via API PATCH (8.2.3 insurance; restored proper line-break formatting). can_send=true. SUBMIT-READY; awaiting Tim Submit.",
            "[2026-06-22] Console UI confirms 'Status of draft: Waiting for moderation' as of 2026-06-22 (screenshot-verified for Daily Dodge 530258; identical console draft-state 'checking' for these). You submitted it since the prior 'awaiting your click' note; exact submit date unknown. Reconciled to submitted."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "backrooms": {
      "gameDir": "Games/128_backrooms",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-05",
          "status": "submitted",
          "notes": [
            "[2026-06-05] Yandex console: WAITING FOR MODERATION"
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": [
        "First-person raycaster Backrooms horror + retention meta."
      ]
    },
    "devourling": {
      "gameDir": "Games/119_devourling",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-07-27",
          "rejectedOn": "2026-06-29",
          "status": "submitted",
          "notes": [
            "[2026-06-29] [2026-06-29] Hardened per Codex review -> rebuilt builds/devourling-yandex-v3.zip, re-uploaded. Added Yandex SDK game_api_pause/resume audio hooks (covers the auto startup fullscreen ad), dropped noisy window-blur suspend, added 90s max ad-watchdog (1.14 anti-freeze). srcFile=11852169, build=checked, can_send=true. Deployed S3 bytes re-verified. STILL awaiting Tim's Submit.",
            "[2026-07-27] [2026-07-27] Reconciled stale rejected -> submitted: live Console probe (list_apps.js) shows 537163 'Waiting for moderation' - the 06-29 v3 fix build was submitted at some point; tracker never updated."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "beast_bazaar": {
      "gameDir": "Games/120_beast_bazaar",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-04",
          "status": "submitted",
          "notes": [
            "[2026-06-05] Yandex console: WAITING FOR MODERATION"
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": {
        "gamepix": {
          "status": "live",
          "url": "https://www.gamepix.com/play/beast-bazaar",
          "notes": [
            "[2026-07-03] LIVE \u2014 the 2026-06-30 original-namespace resubmission was APPROVED; no open draft. Duplicate beast-bazaar-resubmission (ARUB89) stays dead pending support removal. Untouched by the 07-03 cleanup."
          ]
        }
      },
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "boba_rush": {
      "gameDir": "Games/124_boba_rush",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-04",
          "status": "submitted",
          "notes": [
            "[2026-06-05] Yandex console: WAITING FOR MODERATION"
          ]
        },
        "crazygames": {
          "submittedOn": "2026-06-05",
          "rejectedOn": "2026-06-05",
          "status": "built",
          "notes": [
            "[2026-06-05] CG console: NEW_SUBMISSION draft, not finished/submitted"
          ]
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "flip_dash": {
      "gameDir": "Games/116_flip_dash",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-04",
          "status": "submitted",
          "notes": [
            "[2026-06-05] Yandex console: WAITING FOR MODERATION"
          ]
        },
        "crazygames": {
          "submittedOn": "2026-06-05",
          "rejectedOn": "2026-06-05",
          "status": "built",
          "notes": [
            "[2026-06-05] CG console: NEW_SUBMISSION draft, not finished/submitted"
          ]
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "merge_defense": {
      "gameDir": "Games/113_merge_defense",
      "engagement": null,
      "platforms": {
        "yandex": {
          "url": "https://yandex.com/games/app/537866",
          "submittedOn": "2026-06-04",
          "rejectedOn": "2026-06-27",
          "status": "submitted",
          "notes": [
            "[2026-06-27] REJECTED on \u00a74.7/\u00a75.1.1/\u00a75.6 (see rejectionReason). FIXED + re-uploaded to draft 537866: build v2 (merge-defense-yandex-v2.zip) adds adAudioPause/adAudioResume wired into showRewardedVideo onOpen/onClose (audio suspends during ads) + explicit Ad:/\u0420\u0435\u043a\u043b\u0430\u043c\u0430 ad labels (\u00a74.5.1) + canvas backing=CSS no-stretch resize. Cover+icon recomposed from the game's OWN render primitives via window._renderPromo (drawGun/drawEnemy/beams) - no title text. Screenshots replaced: desktop=native landscape gameplay (no bars), mobile=real portrait gameplay (localized). Deployed build BYTES verified (HTTP 200, 77595B: adAudioPause/adAudioResume/_renderPromo/Ad-label/\u0420\u0435\u043a\u043b\u0430\u043c\u0430 present, no console.*, old Math.max(360 gone). draft=rejected(editable) build=checked fill=85%. yandex-presubmit 0 HARD; yandex-testing 0 FAIL; mock-SDK runtime tests PASS (audio-pause + ad no-fill no-freeze). AWAITING Tim's one c...",
            "[2026-06-29] [2026-06-29] Reconciled stale 'rejected' -> submitted: live console state=checking (in moderation) with a CLEAN deployed build (new Audio=0; the 4.7 audio fix is already live). live.json generated."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "gem_cases": {
      "gameDir": "Games/130_gem_cases",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-05",
          "status": "submitted",
          "notes": [
            "[2026-06-05] Yandex console: WAITING FOR MODERATION"
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "bolus": {
      "gameDir": "Games/126_bolus",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-05",
          "status": "submitted",
          "notes": [
            "[2026-06-05] Yandex console: WAITING FOR MODERATION"
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "rage_room": {
      "gameDir": "Games/131_rage_room",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-04",
          "status": "submitted",
          "notes": [
            "[2026-06-05] Yandex console: WAITING FOR MODERATION"
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "relic_restore": {
      "gameDir": "Games/133_relic_restore",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-07",
          "status": "submitted",
          "notes": [
            "[2026-06-06] draft FILLED 85% + build CHECKED + Submit button ENABLED (verified, no validation warnings). All required fields + how-to-play set. ONLY optional promo-video + tags omitted. Ready for Tim's Submit click (NOT submitted)."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "hoard": {
      "gameDir": "Games/122_hoard",
      "engagement": null,
      "platforms": {
        "yandex": {
          "url": "https://yandex.com/games/app/538687",
          "submittedOn": "2026-06-07",
          "approvedOn": "2026-07-26",
          "status": "live",
          "notes": [
            "[2026-06-06] draft FILLED 85% + build CHECKED + Submit button ENABLED (verified, no validation warnings). All required fields + how-to-play set. ONLY optional promo-video + tags omitted. Ready for Tim's Submit click (NOT submitted)."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "critter_siege": {
      "gameDir": "Games/129_critter_siege",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-07",
          "rejectedOn": "2026-07-26",
          "status": "rejected",
          "notes": [
            "[2026-06-06] draft FILLED 85% + build CHECKED + Submit button ENABLED (verified, no validation warnings). All required fields + how-to-play set. ONLY optional promo-video + tags omitted. Ready for Tim's Submit click (NOT submitted).",
            "[2026-07-27] [2026-07-27] Rejection #1 FIXED end-to-end: 1.10.1 tutorial-pill wrap (gf-lib, exact rejected RU strings verified at 3 viewports) + 1.10.1 resize entity reprojection + float edge clamp + 1.10.3 end screens rebuilt as sequential stack (no overlap possible; verified 852x393/480x320/320x480). Field art upgraded (garden beds \u2014 flat coverage 0.87\u21920.25). Guards added; 16 mid-action screenshots retaken EN+RU and replaced on draft; v3 build uploaded (srcFile 12061932, checked, can_send). presubmit PASS; yandex-testing 18/18 PASS; deployed bytes verified. Awaiting Tim's Submit click."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "smelter_tycoon": {
      "gameDir": "Games/123_smelter_tycoon",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-07",
          "rejectedOn": "2026-07-26",
          "status": "rejected",
          "notes": [
            "[2026-06-06] draft FILLED 85% + build CHECKED + Submit button ENABLED (verified, no validation warnings). All required fields + how-to-play set. ONLY optional promo-video + tags omitted. Ready for Tim's Submit click (NOT submitted). [2026-06-07] Re-uploaded fixed build to draft via fill_draft_api after Tim flagged broken UI. Fixed top-right HUD overlap (METAL/EARNED text was drawn over the mute+help buttons; re-anchored left of them) + added platform autostart (drops straight into gameplay w/ interactive demo-hand tutorial; gallery keeps menu). yandex-testing PASS, presubmit PASS, promos regenerated. Build re-processing (checking->checked); NOT submitted (awaiting Tim playtest + Submit). Source committed to gallery (deployed).",
            "[2026-07-27] [2026-07-27] Rejection #1 FIXED end-to-end: 8.3.3 icon de-framed (crop 44px/side, full-bleed; id 12061452 on draft) + 2.3 categories left as moderation set them (SUBMISSION.md now casual-only). Source hardened: selection guards, vector check mark, landscape layout floors fixed (furnace/rows). v2 build uploaded (srcFile 12062086, checked, can_send). presubmit PASS; yandex-testing 18/18 PASS; deployed bytes verified. Awaiting Tim's Submit click."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "orb_legion": {
      "gameDir": "Games/135_orb_legion",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-07",
          "status": "submitted",
          "notes": [
            "[2026-06-06] draft FILLED 85% + build CHECKED + Submit button ENABLED (verified, no validation warnings). All required fields + how-to-play set. ONLY optional promo-video + tags omitted. Ready for Tim's Submit click (NOT submitted). [2026-06-07] Re-uploaded fixed build to draft via fill_draft_api after Tim flagged broken UI. Added 4 new stages (5-8: Ashfall Spire/Frozen Trench/Thornwood Maw/Eclipse Throne -> 8 total, 2-col select grid) + procedural Daily Trial (re-generated each day) + login-streak D1/D7 hook. Codex-reviewed; 4 edge cases fixed (daily-retry crash, streak day attribution, stale streak display, HUD label). yandex-testing PASS, presubmit PASS, promos regenerated. Build re-processing (checking->checked); NOT submitted (awaiting Tim playtest + Submit). Source committed to gallery (deployed)."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "deep_vein": {
      "gameDir": "Games/121_deep_vein",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-07",
          "status": "submitted",
          "notes": [
            "[2026-06-06] draft FILLED 85% + build CHECKED + Submit button ENABLED (verified, no validation warnings). All required fields + how-to-play set. ONLY optional promo-video + tags omitted. Ready for Tim's Submit click (NOT submitted)."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "parry_core": {
      "gameDir": "Games/102_parry_core",
      "engagement": null,
      "platforms": {
        "yandex": {
          "url": "https://yandex.com/games/app/534739",
          "submittedOn": "2026-06-09",
          "approvedOn": "2026-06-22",
          "status": "live",
          "notes": [
            "[2026-06-09] First Yandex resubmit after rejection #1 (8.3.3 icon + 1.10.3 overlap + 1.6.x deform). Fixed build 11704876 + full-bleed icon 11704882 uploaded to draft + verified 2026-06-09.",
            "[2026-06-22] Live-console probe (list_apps.js): app 534739 now PUBLISHED (status LIVE, no pending draft). Was 'submitted' since 2026-06-09; exact approval date unknown, confirmed live today."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "crash_buggy": {
      "gameDir": "Games/152_crash_buggy",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-11",
          "status": "submitted",
          "notes": [
            "[2026-06-11] [2026-06-11 console probe] SUBMITTED: draft in moderation (Waiting for moderation) since 2026-06-11 09:01 UTC"
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": {
        "gamepix": {
          "status": "submitted",
          "notes": [
            "[2026-07-03] v2 build (gf-lib GamePix.on.pause/resume/soundOff/soundOn audio wiring) uploaded into the ORIGINAL crash-buggy entity per GamePix instruction and submitted; badge REVIEW, version 3FzETLp68VOxydcHzdFtM3BKoLx. 07-01 session mistakenly resubmitted the DEAD duplicate crash-buggy-resubmission (77GC4M); expect/ignore a duplicate rejection email. Duplicate abandoned; support removal pending (Tim email)."
          ]
        }
      },
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "bandlings": {
      "gameDir": "Games/173_bandlings",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-13",
          "status": "submitted",
          "notes": [
            "SUBMITTED 2026-06-13: v9 source 11731396 on app 540545, draft.status=checking / Waiting for moderation, build=checked, fill=90% (only optional video missing), app version=5, age=0+."
          ]
        },
        "crazygames": {
          "submittedOn": "2026-06-15",
          "rejectedOn": "2026-06-22",
          "status": "rejected",
          "notes": [
            "[2026-06-22] Live CG portal probe: REJECTED (was tracked awaiting review)."
          ]
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "merge_diner": {
      "gameDir": "Games/132_merge_diner",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-22",
          "status": "submitted",
          "notes": [
            "[2026-06-13] Draft auto-filled 2026-06-13; build checked; awaiting Tim manual Submit for moderation click.",
            "[2026-06-22] Console UI confirms 'Status of draft: Waiting for moderation' as of 2026-06-22 (screenshot-verified for Daily Dodge 530258; identical console draft-state 'checking' for these). You submitted it since the prior 'awaiting your click' note; exact submit date unknown. Reconciled to submitted."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": {
        "gamepix": {
          "status": "live",
          "url": "https://www.gamepix.com/play/merge-diner",
          "notes": [
            "[2026-07-03] LIVE \u2014 the 2026-06-30 original-namespace resubmission was APPROVED (dashboard Updated date 2026-07-02); no open draft. Duplicate merge-diner-resubmission (4E8SDR) stays dead pending support removal. Untouched by the 07-03 cleanup."
          ]
        },
        "youtube": {
          "status": "submitted",
          "notes": [
            "[2026-07-23] [2026-07-23] Mediacube revision (screen shakes + text overlap) fixed and resubmitted: all GF.setShake calls removed; announcements serialized (NEW CUISINE -> LEVEL UP queue, one pill toast at a time, duplicate center floats dropped). Archive 86 replaced, sha 42e4e1ad8b66deba80fbaf46236ca1831bc3f16dad436442c87b1c0fd7a214e6; validation 3257 8/8; heap 9.5MiB; manual cert recorded; submitted 17:33Z -> build_updated (in review). Store thumbs replaced with Tim's new covers (16:9 + 5:7).",
            "[2026-07-23] [2026-07-23 later] ADS-FIRST v1.0.2 resubmitted: ytgame.ads rewarded clear_counter + head_start on game over (fail-closed) + interstitial on PLAY AGAIN (90s gap); MD's own bootstrap had the window-wide pause gate killing dialog clicks - ported the game-surface-scoped gate. Ads smoke 29/29; sha 4cde7a1a17039956e39199c30a5c90dbc062b405a2087c4eafffb038b22c4ed7; validation 3267 8/8; heap 9.5MiB; declarations set; hints rewarded+interstitial=true; submitted 20:47Z -> review."
          ]
        }
      },
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "claw_tycoon": {
      "gameDir": "Games/153_claw_tycoon",
      "engagement": null,
      "platforms": {
        "yandex": {
          "url": "https://yandex.com/games/app/541033",
          "submittedOn": "2026-06-22",
          "approvedOn": "2026-07-26",
          "status": "live",
          "notes": [
            "[2026-06-13] Draft auto-filled 2026-06-13; build checked; awaiting Tim manual Submit for moderation click.",
            "[2026-06-22] Console UI confirms 'Status of draft: Waiting for moderation' as of 2026-06-22 (screenshot-verified for Daily Dodge 530258; identical console draft-state 'checking' for these). You submitted it since the prior 'awaiting your click' note; exact submit date unknown. Reconciled to submitted."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": {
        "gamepix": {
          "status": "live",
          "url": "https://www.gamepix.com/play/claw-tycoon",
          "notes": [
            "[2026-07-03] LIVE, approved 2026-06-29; SDK release draft approved and absorbed \u2014 no open draft. Untouched by the 07-03 cleanup."
          ]
        }
      },
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "shipwreck_scrub": {
      "gameDir": "Games/172_shipwreck_scrub",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-06-22",
          "status": "submitted",
          "notes": [
            "[2026-06-13] Draft auto-filled 2026-06-13; build checked; awaiting Tim manual Submit for moderation click.",
            "[2026-06-22] Console UI confirms 'Status of draft: Waiting for moderation' as of 2026-06-22 (screenshot-verified for Daily Dodge 530258; identical console draft-state 'checking' for these). You submitted it since the prior 'awaiting your click' note; exact submit date unknown. Reconciled to submitted."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": {
        "gamepix": {
          "status": "submitted",
          "notes": [
            "[2026-07-03] [2026-07-03] v2 REJECTED by GamePix review (2nd-level ad: no skip button + game sounds audible). Root cause: gameplayStop() inside the ad bracket made the SDK stack a second auto-interstitial whose on.resume un-muted the game mid-ad; happyMoment() was a second uncontrolled trigger. v3 = single-authority reason-gated mute (manualAd/sdkAd/platformMuted/external) + exactly ONE interstitial path (removed gameStop/happyMoment from ad flow). Verified 16/16 in scripts/gamepix_ad_harness.mjs (incl. chaos on.resume mid-ad). Resubmitted into ORIGINAL entity RB27BC, version 3FzbQLTlF0pDP1fb8rjdtbE5Qoo, badge REVIEW.",
            "[2026-07-03] [2026-07-03] v4 resubmitted into ORIGINAL RB27BC (version 3FzskWbiBZoRYGE4OstQVWMYBak): occlusion mute belt (IntersectionObserver v2 holds mute while ad overlay covers canvas, survives early SDK release), 60s min gap between ad requests. Harness 18/18 incl v3-leak regression case."
          ]
        }
      },
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "gulp_rush": {
      "gameDir": "Games/187_gulp_rush",
      "engagement": null,
      "platforms": {
        "yandex": {
          "status": "not_started"
        },
        "crazygames": {
          "submittedOn": "2026-06-15",
          "rejectedOn": "2026-06-22",
          "status": "rejected",
          "notes": [
            "[2026-06-22] Live CG portal probe: REJECTED (was tracked awaiting review)."
          ]
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "yandex",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "2048 Brain Rot Band": {
      "gameDir": "Games/197_nubik_2048",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-07-22",
          "status": "submitted",
          "notes": [
            "[2026-07-22] [2026-07-22] Tim challenged the diptych desktop screenshots (composed = gray zone). Replaced: game now draws a COLORED themed backdrop at wide viewports (CSS gradient - the 5.9 rejection text explicitly allows '\u0446\u0432\u0435\u0442\u043d\u0443\u044e \u043f\u043e\u0434\u043b\u043e\u0436\u043a\u0443'); desktop shots are REAL unmodified 1280x720 frames. Content gate 0 FAIL. Rebuilt+uploaded (source 12014711, rev 5yjyw3xf), hosted-verified backdrop live, 0 errors. Learning doc updated: never stitch screenshot collages. Was/now doc republished with real frames.",
            "[2026-07-22] [2026-07-22] SUBMITTED for moderation by Tim. Yandex now shows a 23-item 'Checklist before the first release' modal at Submit (SDK/Technical/Interface, each rule-linked) - every item maps to a gate we built; screenshot + map in Learnings/Yandex Rejection Patterns.md."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "patisserie_push": {
      "gameDir": "Games/204_patisserie_push",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-07-22",
          "status": "submitted",
          "notes": [
            "[2026-07-22] [2026-07-22 READY] Full recheck: playtest 0 errors, presubmit PASS, ad_audio_proof PASS (incl click-out repro + late-onOpen guard), draft checked fill 90 canSend missing-none, hosted rev jfj9j1f8 boots clean. Ready for Tim Submit.",
            "[2026-07-22] [2026-07-22] SUBMITTED for moderation by Tim. Yandex now shows a 23-item 'Checklist before the first release' modal at Submit (SDK/Technical/Interface, each rule-linked) - every item maps to a gate we built; screenshot + map in Learnings/Yandex Rejection Patterns.md."
          ]
        },
        "crazygames": {
          "submittedOn": "2026-06-22",
          "status": "submitted",
          "notes": [
            "[2026-06-22] [2026-06-22] Re-uploaded after Tim feedback: fixed Space blowing through level-clear/spirit-dialogue/build-menu; rewarded coins-for-video now grants on Basic-Launch adsDisabled (no dead button); gated interstitial to L3+. REMADE COVERS non-AI = real engine renders (cover hatch -> hero dessert diorama -> make_cg_cover title). apollo --replace -> new draft 2b6ae641 (slug patisserie-push-uju) w/ bug-fixed build + covers. Patched fill_details_art nav (CG step-1 button is 'Go to QA' not 'Continue'). BLOCKED at CG interactive QA-preview gate ('Failed to retrieve QA results, restart preview') - needs a human play-through in CG's QA preview to record a QA result before Details/Submit unlock. Tim to playtest-in-QA-preview (= clears the gate), then covers->Submit.",
            "[2026-06-22] [2026-06-22] SUBMITTED to CrazyGames review - full in-session submit via fill_details_art --submit (zero human work). QA double-build bug fixed in apollo (qaResult -> ALL builds). New non-AI covers (real engine renders). Fixes: Space no longer skips level-clear/spirit/build screens; rewarded coins-for-video grants on Basic-Launch adsDisabled. Submission 2591545c / patisserie-push-dtt."
          ]
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": {
        "youtube": {
          "status": "submitted",
          "notes": [
            "[2026-07-23] [2026-07-23] ADS-FIRST v1.0.1 resubmitted: ytgame.ads interstitial between levels (Continue, level>=3, 90s gap) + rewarded +1200 coins button (patisserie-push-1200-coins, fail-closed CSS-hidden without ads API); fixed the window-wide pause gate AND the aim-handler preventDefault/setPointerCapture eating platform dialog clicks. Ads smoke 21/21 (QA-variant seam-only diff proof); sha fa8b7a981394982dab3762130e9f5ba0853b6a79df9a0aba4559816cf7657a6b; validation 3268 8/8; heap 16.3MiB; declarations set; hints true; submitted 20:47Z -> review."
          ]
        }
      },
      "readyPlatforms": [
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "scrap_launch": {
      "gameDir": "Games/213_scrap_launch",
      "engagement": null,
      "platforms": {
        "yandex": {
          "submittedOn": "2026-07-22",
          "status": "submitted",
          "notes": [
            "[2026-07-22] [2026-07-22] Theme music replaced: CC0 'Upbeat Game Loop - Aurora Ride' (freesound 841299, 31s loop, -19 LUFS under SFX) via Web Audio buffer loop through master (mute/ad-hold inherited); procedural arp kept only as decode fallback. Loot-box reveal card added: full-screen scrim + tinted SVG car icon + win type + name in rarity color + perk, tap dismiss, also used by ad-unlock grants; RU localized. Playtest 25 checks PASS (themePlays, lootRevealCard); rev zw5ovf5t hosted-verified theme+sfx+reveal, 0 errors.",
            "[2026-07-22] [2026-07-22] SUBMITTED for moderation by Tim. Yandex now shows a 23-item 'Checklist before the first release' modal at Submit (SDK/Technical/Interface, each rule-linked) - every item maps to a gate we built; screenshot + map in Learnings/Yandex Rejection Patterns.md."
          ]
        },
        "crazygames": {
          "status": "built"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": [
        "Scrap Launch 3D - 3D launch/fly/wreck/upgrade."
      ]
    },
    "bug_beat": {
      "gameDir": "Games/205_bug_beat",
      "engagement": null,
      "platforms": {
        "yandex": {
          "status": "built"
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "yandex",
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "ice_sweeper": {
      "gameDir": "Games/18_ice_cleanup",
      "engagement": null,
      "platforms": {
        "yandex": {
          "status": "not_started"
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "approvedOn": "2026-06-24",
          "status": "live",
          "notes": [
            "GamePush hosting live; VK distribution blocked on distribution agreement."
          ]
        }
      },
      "other": {
        "gamepix": {
          "status": "live",
          "url": "https://www.gamepix.com/play/ice-sweeper",
          "notes": [
            "[2026-07-03] LIVE, approved 2026-06-29; SDK release draft approved and absorbed \u2014 no open draft. Untouched by the 07-03 cleanup."
          ]
        }
      },
      "readyPlatforms": [
        "yandex",
        "crazygames",
        "gamedistribution"
      ],
      "notes": null
    },
    "bloodtread_mobile": {
      "gameDir": "Gallery/games/bloodtread_mobile",
      "engagement": null,
      "platforms": {
        "yandex": {
          "status": "not_started"
        },
        "crazygames": {
          "submittedOn": "2026-06-29",
          "rejectedOn": "2026-07-01",
          "status": "rejected",
          "notes": [
            "CG Basic launch (slug bloodtread-qrw)."
          ]
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "yandex",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "megaton": {
      "gameDir": "/private/tmp/gallery-megaton-ru-sdk-fix/tg-megaton",
      "engagement": null,
      "platforms": {
        "yandex": {
          "url": "https://app-546866.games.s3.yandex.net/546866/kukb6j0734c9cb3r3nt2l5dlfiaxxu8v/index.html",
          "status": "built",
          "notes": [
            "[2026-07-01] Yandex draft archive replaced with v20260701 daily rewarded ad chest + occasional interstitial cadence; source checked; hosted draft URL https://app-546866.games.s3.yandex.net/546866/qhgjggewhwvc6i0vssdf1yiaqdwvuzjz/index.html; final Submit for moderation still manual.",
            "[2026-07-01] Replaced archive again after ad-audio audit: source file 11869173 checked, fill 90%, hosted draft URL https://app-546866.games.s3.yandex.net/546866/kukb6j0734c9cb3r3nt2l5dlfiaxxu8v/index.html. Verified local + hosted held-open Yandex ad onOpen pauses GF SFX, Megaton external nuke AudioContext, and media; daily rewarded ad no-fill returns after ~4.5s without claiming; D1-D7 + daily rewarded chest UI has no visible paid chest/Stars/premium copy. Final Submit for moderation still manual."
          ]
        },
        "crazygames": {
          "submittedOn": "2026-07-01",
          "status": "submitted",
          "notes": [
            "Submitted for CrazyGames review from megaton-yandex-crazygames branch; status Awaiting review in portal."
          ]
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "yandex",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "meme_evolution_battle": {
      "gameDir": "Games/1_MemesEvolutionBattle",
      "engagement": null,
      "platforms": {
        "yandex": {
          "status": "not_started"
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": {
        "gamepix": {
          "status": "live",
          "url": "https://www.gamepix.com/play/meme-evolution-battle",
          "notes": [
            "[2026-07-03] LIVE (pre-existing; exact go-live date unknown, so no approvedOn recorded; state verified live 2026-07-03). Untouched by the 07-03 cleanup."
          ]
        }
      },
      "readyPlatforms": [
        "yandex",
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "city_destruction_sim": {
      "gameDir": "Games/220_city_destruction_sim",
      "engagement": null,
      "platforms": {
        "yandex": {
          "status": "built",
          "notes": [
            "Draft filled 2026-07-05; archive checked; fill 90%; IAP products city_coins_50000_min and city_no_ads active."
          ]
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": null,
      "readyPlatforms": [
        "yandex",
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    },
    "tight_spot": {
      "gameDir": "Games/109_tight_spot",
      "engagement": null,
      "platforms": {
        "yandex": {
          "status": "not_started"
        },
        "crazygames": {
          "status": "not_started"
        },
        "gamedistribution": {
          "status": "not_started"
        },
        "gamepush": {
          "status": "not_started"
        }
      },
      "other": {
        "youtube": {
          "status": "rejected",
          "notes": [
            "[2026-07-23] [2026-07-23] Mediacube revision (element overlap + add ads) fixed and resubmitted: wide-menu DAILY/GARAGE now flank PLAY; ytgame.ads added (interstitial every 2 levels on NEXT, rewarded SKIP LEVEL after 2+ crashes, fail-closed). Archive 87 replaced, sha af27e934b77b0691051368e960e632681d3aa123b422c0739db0b1086a5fd35b; ads_static_hint rewarded+interstitial=true; validation 3256 8/8; heap 9.5MiB; manual cert recorded; submitted 17:33Z -> build_updated (in review). Ads smoke 34/34: output/mcplay-revision-2026-07-23/",
            "[2026-07-27] [2026-07-27] Rejection #3 (08:19Z): reload reset progress to level 1. Root cause: MCPlay preview wipes localStorage every boot + parent mock-store can hydrate late or be absent (standalone tab); wrapper trusted the first '{}' loadData and the level-1 boot then overwrote the real save. Fixed the SHARED yt wrapper (Games/17_clean_sweep BOOTSTRAP_Z): empty-load retries (3x450ms), IndexedDB mirror tier (survives their wipe; cloud stays authoritative), mirror-on-every-storage-change, hung-load mirror restore. Proven vs the REAL downloaded _playables_sdk.js: 17/17 reload-persistence checks incl. reviewer flow (park->reload->progress kept), late-hydration no-clobber, new-player, hung-cloud. Also fixed 3 reviewer-eyes defects found in own sweep: duplicate park floats over LEVELCLEAR panel, garage perk mid-phrase truncation, GT Prototype row dropped at 1024x500 (now buy-tested by rea..."
          ]
        }
      },
      "readyPlatforms": [
        "yandex",
        "crazygames",
        "gamedistribution",
        "gamepush"
      ],
      "notes": null
    }
  },
  "untracked": [],
  "summary": {
    "yandex": {
      "live": 5,
      "approved": 0,
      "submitted": 24,
      "rejected": 2,
      "built": 4
    },
    "crazygames": {
      "live": 0,
      "approved": 0,
      "submitted": 2,
      "rejected": 5,
      "built": 6
    },
    "gamedistribution": {
      "live": 0,
      "approved": 0,
      "submitted": 1,
      "rejected": 0,
      "built": 1
    },
    "gamepush": {
      "live": 2,
      "approved": 0,
      "submitted": 0,
      "rejected": 0,
      "built": 3
    }
  }
};
