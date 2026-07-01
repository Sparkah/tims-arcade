(function() {
"use strict";

// 10 bands x 10 levels = 100 total levels.
// Tune these values to rebalance generated levels without touching game logic.
window.MergeConquestLevelBands = [
    { world: 1, minCols: 3, maxCols: 4, minRows: 4, maxRows: 5, aiAP: 2, aiSpawnBonus: 0, aiBehavior: "expand", playerUnits: 2, aiUnits: 2, parBase: 6 },
    { world: 2, minCols: 4, maxCols: 5, minRows: 5, maxRows: 6, aiAP: 2, aiSpawnBonus: 0, aiBehavior: "cautious", playerUnits: 3, aiUnits: 3, parBase: 9 },
    { world: 3, minCols: 5, maxCols: 6, minRows: 5, maxRows: 6, aiAP: 3, aiSpawnBonus: 0, aiBehavior: "full", playerUnits: 4, aiUnits: 4, parBase: 11 },
    { world: 4, minCols: 5, maxCols: 6, minRows: 6, maxRows: 7, aiAP: 3, aiSpawnBonus: 1, aiBehavior: "full", playerUnits: 4, aiUnits: 4, parBase: 13 },
    { world: 5, minCols: 6, maxCols: 7, minRows: 6, maxRows: 7, aiAP: 3, aiSpawnBonus: 1, aiBehavior: "aggressive", playerUnits: 4, aiUnits: 5, parBase: 15 },
    { world: 6, minCols: 6, maxCols: 7, minRows: 7, maxRows: 8, aiAP: 4, aiSpawnBonus: 1, aiBehavior: "full", playerUnits: 5, aiUnits: 5, parBase: 17 },
    { world: 7, minCols: 7, maxCols: 8, minRows: 7, maxRows: 8, aiAP: 4, aiSpawnBonus: 1, aiBehavior: "full", playerUnits: 5, aiUnits: 6, parBase: 19 },
    { world: 8, minCols: 7, maxCols: 8, minRows: 8, maxRows: 9, aiAP: 4, aiSpawnBonus: 2, aiBehavior: "full", playerUnits: 5, aiUnits: 6, parBase: 21 },
    { world: 9, minCols: 8, maxCols: 9, minRows: 8, maxRows: 9, aiAP: 4, aiSpawnBonus: 2, aiBehavior: "aggressive", playerUnits: 6, aiUnits: 6, parBase: 23 },
    { world: 10, minCols: 8, maxCols: 9, minRows: 9, maxRows: 10, aiAP: 5, aiSpawnBonus: 2, aiBehavior: "full", playerUnits: 6, aiUnits: 7, parBase: 25 }
];
})();
