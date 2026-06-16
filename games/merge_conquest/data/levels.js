(function() {
"use strict";

var LEVEL_COUNT = 100;
var bands = window.MergeConquestLevelBands || [];

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function copyPoints(points) {
    return points.map(function(p) { return { c: p.c, r: p.r }; });
}

function makeCornerStarts(cols, rows, count, corner) {
    var seeds;
    if (corner === "player") {
        seeds = [
            { c: 0, r: rows - 1 }, { c: 1, r: rows - 1 }, { c: 0, r: rows - 2 },
            { c: 1, r: rows - 2 }, { c: 2, r: rows - 1 }, { c: 0, r: rows - 3 },
            { c: 2, r: rows - 2 }, { c: 1, r: rows - 3 }, { c: 3, r: rows - 1 }
        ];
    } else {
        seeds = [
            { c: cols - 1, r: 0 }, { c: cols - 2, r: 0 }, { c: cols - 1, r: 1 },
            { c: cols - 2, r: 1 }, { c: cols - 3, r: 0 }, { c: cols - 1, r: 2 },
            { c: cols - 3, r: 1 }, { c: cols - 2, r: 2 }, { c: cols - 4, r: 0 }
        ];
    }

    var used = {};
    var out = [];
    for (var i = 0; i < seeds.length && out.length < count; i++) {
        var s = seeds[i];
        if (s.c < 0 || s.r < 0 || s.c >= cols || s.r >= rows) continue;
        var key = s.c + "," + s.r;
        if (used[key]) continue;
        used[key] = true;
        out.push(s);
    }
    return out;
}

function makeTierArray(count, startingTier) {
    var arr = [];
    for (var i = 0; i < count; i++) arr.push(1);
    if (arr.length > 0 && startingTier > 1) arr[0] = startingTier;
    return arr;
}

function getBandForLevel(levelNumber) {
    var bandIndex = Math.floor((levelNumber - 1) / 10);
    return bands[clamp(bandIndex, 0, bands.length - 1)] || bands[0];
}

function makeGeneratedLevel(levelNumber) {
    var band = getBandForLevel(levelNumber);
    var idxInBand = (levelNumber - 1) % 10;

    var cols = clamp(band.minCols + Math.floor((idxInBand + (levelNumber % 2)) / 4), band.minCols, band.maxCols);
    var rows = clamp(band.minRows + Math.floor((idxInBand + ((levelNumber + 1) % 2)) / 4), band.minRows, band.maxRows);

    var playerUnits = clamp(band.playerUnits + Math.floor(idxInBand / 5), 2, 8);
    var aiUnits = clamp(band.aiUnits + Math.floor((idxInBand + 2) / 5), 2, 8);

    var isMilestone = (levelNumber % 10 === 0);
    var aiAP = band.aiAP + (isMilestone ? 1 : 0);
    var aiSpawnBonus = band.aiSpawnBonus + (isMilestone ? 1 : 0);
    var aiBehavior = isMilestone ? "aggressive" : band.aiBehavior;
    var aiStartTier = isMilestone ? clamp(1 + Math.floor(levelNumber / 35), 1, 3) : 1;

    return {
        cols: cols,
        rows: rows,
        playerTiles: makeCornerStarts(cols, rows, playerUnits, "player"),
        playerStartTiers: makeTierArray(playerUnits, 1),
        aiTiles: makeCornerStarts(cols, rows, aiUnits, "ai"),
        aiStartTiers: makeTierArray(aiUnits, aiStartTier),
        aiAP: aiAP,
        aiBehavior: aiBehavior,
        aiSpawnBonus: aiSpawnBonus,
        parTurns: band.parBase + idxInBand + (isMilestone ? 2 : 0),
        tutorial: false,
        name: "World " + band.world + " - Battle " + (idxInBand + 1)
    };
}

// Hand-authored levels can override generated levels by level number.
// This is the primary place for manual designer edits.
var handcraftedLevels = {
    1: {
        cols: 1, rows: 3,
        playerTiles: [{ c: 0, r: 2 }, { c: 0, r: 1 }],
        playerStartTiers: [1, 1],
        aiTiles: [{ c: 0, r: 0 }],
        aiStartTiers: [1],
        aiAP: 1, aiBehavior: "passive", aiSpawnBonus: 0,
        parTurns: 2, tutorial: true, name: "First Steps"
    },
    2: {
        cols: 3, rows: 3,
        playerTiles: [{ c: 0, r: 2 }, { c: 1, r: 2 }],
        playerStartTiers: [1, 1],
        aiTiles: [{ c: 2, r: 0 }, { c: 2, r: 1 }],
        aiStartTiers: [1, 1],
        aiAP: 2, aiBehavior: "expand", aiSpawnBonus: 0,
        parTurns: 4, tutorial: "l2", name: "Skirmish"
    },
    3: {
        cols: 4, rows: 3,
        playerTiles: [{ c: 0, r: 2 }, { c: 1, r: 2 }, { c: 0, r: 1 }],
        playerStartTiers: [1, 1, 1],
        aiTiles: [{ c: 3, r: 0 }, { c: 2, r: 0 }, { c: 3, r: 1 }],
        aiStartTiers: [1, 1, 1],
        aiAP: 2, aiBehavior: "cautious", aiSpawnBonus: 0,
        parTurns: 6, tutorial: false, name: "First Blood"
    },
    4: {
        cols: 4, rows: 5,
        playerTiles: [{ c: 0, r: 4 }, { c: 1, r: 4 }, { c: 0, r: 3 }],
        playerStartTiers: [1, 1, 1],
        aiTiles: [{ c: 3, r: 0 }, { c: 3, r: 1 }, { c: 2, r: 0 }],
        aiStartTiers: [1, 1, 1],
        aiAP: 2, aiBehavior: "full", aiSpawnBonus: 0,
        parTurns: 10, tutorial: false, name: "Contested Ground"
    },
    5: {
        cols: 5, rows: 5,
        playerTiles: [{ c: 0, r: 4 }, { c: 1, r: 4 }, { c: 0, r: 3 }, { c: 1, r: 3 }],
        playerStartTiers: [1, 1, 1, 1],
        aiTiles: [{ c: 4, r: 0 }, { c: 3, r: 0 }, { c: 4, r: 1 }, { c: 3, r: 1 }],
        aiStartTiers: [1, 1, 1, 1],
        aiAP: 3, aiBehavior: "aggressive", aiSpawnBonus: 0,
        parTurns: 12, tutorial: false, name: "The March"
    },
    6: {
        cols: 5, rows: 6,
        playerTiles: [{ c: 0, r: 5 }, { c: 1, r: 5 }, { c: 0, r: 4 }, { c: 1, r: 4 }],
        playerStartTiers: [1, 1, 1, 1],
        aiTiles: [{ c: 4, r: 0 }, { c: 3, r: 0 }, { c: 4, r: 1 }, { c: 3, r: 1 }],
        aiStartTiers: [1, 1, 1, 1],
        aiAP: 3, aiBehavior: "full", aiSpawnBonus: 0,
        parTurns: 14, tutorial: false, name: "Siege Lines"
    },
    7: {
        cols: 5, rows: 7,
        playerTiles: [{ c: 0, r: 6 }, { c: 1, r: 6 }, { c: 0, r: 5 }, { c: 1, r: 5 }],
        playerStartTiers: [1, 1, 1, 1],
        aiTiles: [{ c: 4, r: 0 }, { c: 3, r: 0 }, { c: 4, r: 1 }, { c: 3, r: 1 }],
        aiStartTiers: [1, 1, 1, 1],
        aiAP: 3, aiBehavior: "full", aiSpawnBonus: 1,
        parTurns: 16, tutorial: false, name: "War of Attrition"
    },
    8: {
        cols: 6, rows: 6,
        playerTiles: [{ c: 0, r: 5 }, { c: 1, r: 5 }, { c: 0, r: 4 }, { c: 1, r: 4 }],
        playerStartTiers: [1, 1, 1, 1],
        aiTiles: [{ c: 5, r: 0 }, { c: 4, r: 0 }, { c: 5, r: 1 }, { c: 4, r: 1 }, { c: 3, r: 0 }],
        aiStartTiers: [1, 1, 1, 1, 1],
        aiAP: 3, aiBehavior: "full", aiSpawnBonus: 1,
        parTurns: 18, tutorial: false, name: "Iron Front"
    },
    9: {
        cols: 6, rows: 7,
        playerTiles: [{ c: 0, r: 6 }, { c: 1, r: 6 }, { c: 0, r: 5 }, { c: 1, r: 5 }],
        playerStartTiers: [1, 1, 1, 1],
        aiTiles: [{ c: 5, r: 0 }, { c: 4, r: 0 }, { c: 5, r: 1 }, { c: 4, r: 1 }, { c: 3, r: 0 }],
        aiStartTiers: [1, 1, 1, 1, 1],
        aiAP: 4, aiBehavior: "full", aiSpawnBonus: 1,
        parTurns: 20, tutorial: false, name: "The Crucible"
    },
    10: {
        cols: 7, rows: 7,
        playerTiles: [{ c: 0, r: 6 }, { c: 1, r: 6 }, { c: 0, r: 5 }, { c: 1, r: 5 }],
        playerStartTiers: [1, 1, 1, 1],
        aiTiles: [{ c: 6, r: 0 }, { c: 5, r: 0 }, { c: 6, r: 1 }, { c: 5, r: 1 }, { c: 4, r: 0 }],
        aiStartTiers: [2, 1, 1, 1, 1],
        aiAP: 4, aiBehavior: "full", aiSpawnBonus: 1,
        parTurns: 24, tutorial: false, name: "Conquest"
    },
    20: { name: "Iron Bastion" },
    30: { name: "Red Frontier" },
    40: { name: "Shattered Line" },
    50: { name: "Siege of Ash" },
    60: { name: "Crimson Delta" },
    70: { name: "The Long War" },
    80: { name: "Steel Tempest" },
    90: { name: "Black Banner" },
    100: { name: "Final Conquest" },

    // v11.6: shape-variety bonus levels — blocked cells render as rocks.
    // Coords match typical generated grid sizes for that band; out-of-range
    // entries silently noop (initGrid getCell returns null). Player corner
    // (bottom-left) + AI corner (top-right) stay clear.
    5:  { name: "Cleft Pass",    blocked: [{c:2,r:1}] },
    15: { name: "Stone Cross",   blocked: [{c:2,r:1},{c:2,r:2},{c:1,r:2},{c:3,r:2},{c:2,r:3}] },
    35: { name: "Ridge Cut",     blocked: [{c:2,r:2},{c:3,r:2},{c:2,r:3},{c:3,r:3}] },
    55: { name: "The Maw",       blocked: [{c:1,r:2},{c:2,r:2},{c:3,r:2},{c:4,r:2}] },
    65: { name: "Twin Chasm",    blocked: [{c:2,r:1},{c:2,r:2},{c:2,r:3},{c:4,r:1},{c:4,r:2},{c:4,r:3}] },
    85: { name: "Volcanic Spur", blocked: [{c:2,r:2},{c:3,r:1},{c:4,r:2},{c:3,r:3}] }
};

function mergeLevel(base, override) {
    var out = {};
    var k;
    for (k in base) out[k] = base[k];
    for (k in override) {
        if (k === "playerTiles" || k === "aiTiles") out[k] = copyPoints(override[k]);
        else if (k === "playerStartTiers" || k === "aiStartTiers") out[k] = override[k].slice();
        else out[k] = override[k];
    }
    return out;
}

function validateLevel(level, levelNumber) {
    var minLen = Math.min(level.playerTiles.length, level.playerStartTiers.length);
    level.playerTiles = level.playerTiles.slice(0, minLen);
    level.playerStartTiers = level.playerStartTiers.slice(0, minLen);

    minLen = Math.min(level.aiTiles.length, level.aiStartTiers.length);
    level.aiTiles = level.aiTiles.slice(0, minLen);
    level.aiStartTiers = level.aiStartTiers.slice(0, minLen);

    if (!level.name) level.name = "Level " + levelNumber;
    if (level.tutorial === undefined) level.tutorial = false;
}

function buildLevels() {
    var levels = [];
    for (var n = 1; n <= LEVEL_COUNT; n++) {
        var generated = makeGeneratedLevel(n);
        var override = handcraftedLevels[n];
        var level = override ? mergeLevel(generated, override) : generated;
        validateLevel(level, n);
        levels.push(level);
    }
    return levels;
}

window.MergeConquestLevels = buildLevels();
window.MergeConquestLevelHandcrafted = handcraftedLevels;
})();
