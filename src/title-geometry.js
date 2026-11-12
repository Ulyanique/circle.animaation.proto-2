import { Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createTitleGeometry(fontData, text) {
  const font = new Font(fontData);
  const pieces = [];
  let offset = 0;
  for (const character of text) {
    const options = {font, size:1, depth:.038, curveSegments:32, bevelEnabled:true, bevelThickness:.003, bevelSize:.0015, bevelSegments:4};
    let geometry = new TextGeometry(character, options);
    // Some narrow counters form a degenerate bevel bridge. Keep their outline, omit only the bevel.
    if (geometry.attributes.position.array.some(value => !Number.isFinite(value))) {
      geometry.dispose();
      geometry = new TextGeometry(character, {...options, bevelEnabled:false});
    }
    if (geometry.attributes.position.count) {
      geometry.translate(offset,0,0);
      pieces.push(geometry);
    } else geometry.dispose();
    offset += (fontData.glyphs[character] || fontData.glyphs['?']).ha / fontData.resolution + .018;
  }
  const merged = mergeGeometries(pieces);
  pieces.forEach(piece=>piece.dispose());
  merged.computeBoundingBox();
  const bounds = merged.boundingBox;
  merged.translate(-(bounds.min.x+bounds.max.x)/2,0,0);
  merged.computeBoundingBox();merged.computeBoundingSphere();
  return merged;
}
