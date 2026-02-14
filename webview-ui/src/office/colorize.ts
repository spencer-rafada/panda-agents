/**
 * Shared sprite colorization module.
 *
 * Photoshop-style Colorize: grayscale → HSL with given hue/saturation,
 * then brightness/contrast adjustment. Used by both floor tiles and furniture.
 */

import type { SpriteData, FloorColor } from './types.js'

/** Generic colorized sprite cache: arbitrary string key → SpriteData */
const colorizeCache = new Map<string, SpriteData>()

/**
 * Get a colorized sprite from cache, or colorize and cache it.
 * Caller provides a unique cache key (e.g., "floor-3-35-30-15-0" or "furn-desk-200-50-0-0").
 */
export function getColorizedSprite(cacheKey: string, sprite: SpriteData, color: FloorColor): SpriteData {
  const cached = colorizeCache.get(cacheKey)
  if (cached) return cached
  const result = colorizeSprite(sprite, color)
  colorizeCache.set(cacheKey, result)
  return result
}

/** Clear all cached colorized sprites (e.g., on asset reload) */
export function clearColorizeCache(): void {
  colorizeCache.clear()
}

/**
 * Colorize a sprite using HSL transformation.
 *
 * Algorithm (Photoshop Colorize-style):
 * 1. Parse each pixel's color as perceived luminance (0-1)
 * 2. Apply contrast: stretch/compress around midpoint 0.5
 * 3. Apply brightness: shift lightness up/down
 * 4. Create HSL color with user's hue + saturation
 * 5. Convert HSL -> RGB -> hex
 */
export function colorizeSprite(sprite: SpriteData, color: FloorColor): SpriteData {
  const { h, s, b, c } = color
  const result: SpriteData = []

  for (const row of sprite) {
    const newRow: string[] = []
    for (const pixel of row) {
      if (pixel === '') {
        newRow.push('')
        continue
      }

      // Parse hex to get RGB values
      const r = parseInt(pixel.slice(1, 3), 16)
      const g = parseInt(pixel.slice(3, 5), 16)
      const bv = parseInt(pixel.slice(5, 7), 16)
      // Use perceived luminance for grayscale
      let lightness = (0.299 * r + 0.587 * g + 0.114 * bv) / 255

      // Apply contrast: expand/compress around 0.5
      if (c !== 0) {
        const factor = (100 + c) / 100
        lightness = 0.5 + (lightness - 0.5) * factor
      }

      // Apply brightness: shift up/down
      if (b !== 0) {
        lightness = lightness + b / 200
      }

      // Clamp
      lightness = Math.max(0, Math.min(1, lightness))

      // Convert HSL to RGB
      const satFrac = s / 100
      const hex = hslToHex(h, satFrac, lightness)
      newRow.push(hex)
    }
    result.push(newRow)
  }

  return result
}

/** Convert HSL (h: 0-360, s: 0-1, l: 0-1) to #RRGGBB hex string */
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs(hp % 2 - 1))
  let r1 = 0, g1 = 0, b1 = 0

  if (hp < 1) { r1 = c; g1 = x; b1 = 0 }
  else if (hp < 2) { r1 = x; g1 = c; b1 = 0 }
  else if (hp < 3) { r1 = 0; g1 = c; b1 = x }
  else if (hp < 4) { r1 = 0; g1 = x; b1 = c }
  else if (hp < 5) { r1 = x; g1 = 0; b1 = c }
  else { r1 = c; g1 = 0; b1 = x }

  const m = l - c / 2
  const r = Math.round((r1 + m) * 255)
  const g = Math.round((g1 + m) * 255)
  const bOut = Math.round((b1 + m) * 255)

  return `#${clamp255(r).toString(16).padStart(2, '0')}${clamp255(g).toString(16).padStart(2, '0')}${clamp255(bOut).toString(16).padStart(2, '0')}`.toUpperCase()
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, v))
}
