export const objectLibrary = [
  ['Wooden chair', 'chair.svg'],
  ['Brass key', 'key.svg'],
  ['CRT monitor', 'monitor.svg'],
].map(([name, file]) => ({name, url: new URL(file, import.meta.url).href}));

export function chooseDemoObjects(random = Math.random, previous = []) {
  const roll = random();
  const count = roll < .6 ? 1 : roll < .9 ? 2 : 3;
  const available = [...objectLibrary];
  const selected = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(random() * available.length);
    selected.push(...available.splice(index, 1));
  }
  if (available.length && count === previous.length && selected.every(item => previous.some(object => object.url === item.url))) {
    selected[count - 1] = available[Math.floor(random() * available.length)];
  }
  return selected;
}
