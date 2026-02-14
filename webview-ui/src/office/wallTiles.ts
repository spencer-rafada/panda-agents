/**
 * Wall tile auto-tiling: sprite storage and bitmask-based piece selection.
 *
 * Stores 16 wall sprites (one per 4-bit bitmask) loaded from walls.png.
 * At render time, each wall tile's 4 cardinal neighbors are checked to build
 * a bitmask, and the corresponding sprite is drawn directly.
 * No changes to the layout model — auto-tiling is purely visual.
 *
 * Bitmask convention: N=1, E=2, S=4, W=8. Out-of-bounds = NOT wall.
 */

import type { SpriteData, TileType as TileTypeVal } from './types.js'
import { TileType, TILE_SIZE, MAP_ROWS, MAP_COLS } from './types.js'

/** 16 wall sprites indexed by bitmask (0-15) */
let wallSprites: SpriteData[] | null = null

/** Set wall sprites (called once when extension sends wallTilesLoaded) */
export function setWallSprites(sprites: SpriteData[]): void {
  wallSprites = sprites
}

/** Check if wall sprites have been loaded */
export function hasWallSprites(): boolean {
  return wallSprites !== null
}

/**
 * Get the wall sprite for a tile based on its cardinal neighbors.
 * Returns the sprite + Y offset, or null to fall back to solid WALL_COLOR.
 */
export function getWallSprite(
  col: number,
  row: number,
  tileMap: TileTypeVal[][],
): { sprite: SpriteData; offsetY: number } | null {
  if (!wallSprites) return null

  // Build 4-bit neighbor bitmask
  let mask = 0
  if (row > 0 && tileMap[row - 1][col] === TileType.WALL) mask |= 1            // N
  if (col < MAP_COLS - 1 && tileMap[row][col + 1] === TileType.WALL) mask |= 2  // E
  if (row < MAP_ROWS - 1 && tileMap[row + 1][col] === TileType.WALL) mask |= 4  // S
  if (col > 0 && tileMap[row][col - 1] === TileType.WALL) mask |= 8             // W

  const sprite = wallSprites[mask]
  if (!sprite) return null

  // Anchor sprite at bottom of tile — tall sprites extend upward
  return { sprite, offsetY: TILE_SIZE - sprite.length }
}
