const blackPoint = .04;
const whitePoint = .94;
const shadowCurve = 1.23;

export function gradePixels(pixels) {
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue;
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];
    const luminance = .2126 * red + .7152 * green + .0722 * blue;
    const level = Math.min(1, Math.max(0, (luminance / 255 - blackPoint) / (whitePoint - blackPoint)));
    const gain = 255 * level ** shadowCurve / Math.max(1, luminance);
    // Adjust luminance while retaining the relative color of each material.
    pixels[i] = (.96 * red + .04 * luminance) * gain;
    pixels[i + 1] = (.96 * green + .04 * luminance) * gain;
    pixels[i + 2] = (.96 * blue + .04 * luminance) * gain;
  }
  return pixels;
}
