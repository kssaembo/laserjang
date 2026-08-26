const rotateIntoLocal = (direction, pieceDirection) => (direction - pieceDirection + 4) % 4;
const rotateIntoBoard = (direction, pieceDirection) => (direction + pieceDirection) % 4;

/**
 * Returns how a beam interacts with a directional piece.
 * Directions: 0 north, 1 east, 2 south, 3 west.
 * Piece direction 0 matches the unrotated PNG asset.
 */
export function opticalInteraction(type, pieceDirection, incomingDirection) {
  const localIncoming = rotateIntoLocal(incomingDirection, pieceDirection);

  if (type === 'square') {
    // The unrotated square PNG's coloured mirror face is on the top (north).
    // Only a beam arriving from that face reflects straight back by 180°.
    if (localIncoming !== 2) return { destroy: true, passThrough: false, reflected: [] };
    return { destroy: false, passThrough: false, reflected: [(incomingDirection + 2) % 4] };
  }

  if (type === 'triangle') {
    // The unrotated triangle is a backslash mirror with its solid body to the south-west.
    // Beams arriving from the north/east meet the diagonal face and turn away by 90°.
    if (localIncoming !== 2 && localIncoming !== 3) return { destroy: true, passThrough: false, reflected: [] };
    const localReflected = 3 - localIncoming;
    return { destroy: false, passThrough: false, reflected: [rotateIntoBoard(localReflected, pieceDirection)] };
  }

  if (type === 'splitter') {
    // The thick diagonal is a two-sided backslash beam splitter.
    // One ray always continues straight and a second ray reflects by 90°.
    const localReflected = 3 - localIncoming;
    return { destroy: false, passThrough: true, reflected: [rotateIntoBoard(localReflected, pieceDirection)] };
  }

  return { destroy: false, passThrough: false, reflected: [] };
}
