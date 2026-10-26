// View-only geometry: export coordinates always remain integers in the original raster grid.
export function pagePoint(clientX, clientY, bounds, page) {
  if (![bounds.left, bounds.top, bounds.width, bounds.height, clientX, clientY].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) throw new Error('PDF preview is not measurable.');
  return { x: Math.max(0, Math.min(page.width, Math.round((clientX - bounds.left) / bounds.width * page.width))), y: Math.max(0, Math.min(page.height, Math.round((clientY - bounds.top) / bounds.height * page.height))) };
}
export function editBox(box, dx, dy, page, resize = false) {
  if (resize) return { ...box, width: Math.max(2, Math.min(page.width - box.x, box.width + dx)), height: Math.max(2, Math.min(page.height - box.y, box.height + dy)) };
  return { ...box, x: Math.max(0, Math.min(page.width - box.width, box.x + dx)), y: Math.max(0, Math.min(page.height - box.height, box.y + dy)) };
}
