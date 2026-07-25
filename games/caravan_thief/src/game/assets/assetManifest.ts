import Phaser from 'phaser';

export const AssetKeys = {
  // Add stable asset keys here.
} as const;

export type ImageAsset = {
  key: string;
  url: string;
};

export type SpritesheetAsset = {
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
  margin?: number;
  spacing?: number;
};

export const imageAssets: ImageAsset[] = [
  { key: 'thief', url: 'assets/images/thief.png' },
  { key: 'wagon', url: 'assets/images/wagon.png' },
  { key: 'strongbox', url: 'assets/images/strongbox.png' },
  { key: 'dog', url: 'assets/images/dog.png' },
];
export const spritesheetAssets: SpritesheetAsset[] = [];

export function loadAssetManifest(scene: Phaser.Scene): void {
  for (const asset of imageAssets) {
    scene.load.image(asset.key, asset.url);
  }

  for (const asset of spritesheetAssets) {
    scene.load.spritesheet(asset.key, asset.url, {
      frameWidth: asset.frameWidth,
      frameHeight: asset.frameHeight,
      margin: asset.margin,
      spacing: asset.spacing,
    });
  }
}
