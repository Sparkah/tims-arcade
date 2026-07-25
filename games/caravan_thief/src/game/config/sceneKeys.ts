export const SceneKeys = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  TemplateGuide: 'TemplateGuideScene',
  Game: 'GameScene',
  UI: 'UIScene',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
