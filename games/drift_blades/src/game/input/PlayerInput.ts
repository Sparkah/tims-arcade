import Phaser from 'phaser';

export class PlayerInput {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private wasd: Record<string, Phaser.Input.Keyboard.Key> | undefined;
  private pointerTarget = new Phaser.Math.Vector2(0, 0);
  private pointerActive = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.cursors = scene.input.keyboard?.createCursorKeys();
    this.wasd = scene.input.keyboard?.addKeys('W,A,S,D') as
      | Record<string, Phaser.Input.Keyboard.Key>
      | undefined;

    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerActive = true;
      this.pointerTarget.set(pointer.x, pointer.y);
    });

    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) {
        this.pointerActive = true;
        this.pointerTarget.set(pointer.x, pointer.y);
      }
    });

    scene.input.on('pointerup', () => {
      this.pointerActive = false;
    });
  }

  getMovementVector(): Phaser.Math.Vector2 {
    const vector = new Phaser.Math.Vector2(0, 0);

    if (this.cursors?.left.isDown || this.wasd?.A.isDown) vector.x -= 1;
    if (this.cursors?.right.isDown || this.wasd?.D.isDown) vector.x += 1;
    if (this.cursors?.up.isDown || this.wasd?.W.isDown) vector.y -= 1;
    if (this.cursors?.down.isDown || this.wasd?.S.isDown) vector.y += 1;

    if (vector.lengthSq() > 0) {
      return vector.normalize();
    }

    if (!this.pointerActive) {
      return vector;
    }

    const camera = this.scene.cameras.main;
    const center = new Phaser.Math.Vector2(camera.centerX, camera.centerY);
    return this.pointerTarget.clone().subtract(center).normalize();
  }
}
