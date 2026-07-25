import Phaser from 'phaser';

export function createTitleText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '56px',
      color: '#ffffff',
      stroke: '#273043',
      strokeThickness: 8,
    })
    .setOrigin(0.5);
}
