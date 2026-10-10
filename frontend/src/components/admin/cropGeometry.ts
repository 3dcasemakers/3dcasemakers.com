export function rotatedDimensions(width: number, height: number, rotation: number) {
  return Math.abs(rotation % 180) === 90 ? { width: height, height: width } : { width, height };
}

export function cropCoverScale(width: number, height: number, rotation: number, viewportWidth: number, viewportHeight: number) {
  const size = rotatedDimensions(width, height, rotation);
  return size.width > 0 && size.height > 0 ? Math.max(viewportWidth / size.width, viewportHeight / size.height) : 1;
}

export function clampCropOffset(offset: { x: number; y: number }, width: number, height: number, rotation: number, zoom: number, viewportWidth: number, viewportHeight: number) {
  const size = rotatedDimensions(width, height, rotation);
  const maxX = Math.max(0, (size.width * zoom - viewportWidth) / 2);
  const maxY = Math.max(0, (size.height * zoom - viewportHeight) / 2);
  return { x: Math.min(maxX, Math.max(-maxX, offset.x)), y: Math.min(maxY, Math.max(-maxY, offset.y)) };
}
