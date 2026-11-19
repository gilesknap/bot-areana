/**
 * Arena rendering. ArenaView pulls in Phaser; import glyphs from './glyphs' directly when only
 * the SVG part drawings are needed (e.g. the Workshop) to keep Phaser out of that chunk.
 */
export { ArenaView } from './ArenaView';
export { ArenaHud } from './hud';
export { botHalfExtent, botSvg, glyphColour, markerSvg, partGlyphSvg, tileSvg } from './glyphs';
export type { BotSvgOptions, MarkerKind } from './glyphs';
