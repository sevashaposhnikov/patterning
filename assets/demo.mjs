export const objectLibrary = [
  ['Desk with paperwork', 'desk-paperwork'],
  ['Checkered office chair', 'chair-checkered'],
  ['Computer desk', 'desk-computer'],
  ['Leather office chair', 'chair-leather'],
  ['New York taxi, angled view', 'taxi-angle'],
  ['Wooden office chair', 'chair-wood'],
  ['New York taxi, overhead view', 'taxi-overhead'],
  ['Desk with rotary phone', 'desk-telephone'],
  ['Brick apartment building', 'building-brick'],
  ['New York office building', 'building-office'],
  ['Rooftop water tower', 'water-tower'],
  ['Traffic light', 'traffic-light'],
  ['Tree', 'tree'],
  ['New York traffic cone', 'traffic-cone'],
  ['Flying pigeon, wings spread', 'pigeon-wings-spread'],
  ['Flying pigeon, wings raised', 'pigeon-wings-raised'],
  ['Flying pigeon, turning', 'pigeon-turning'],
  ['New York apartment building, overhead view', 'building-apartment-overhead'],
  ['Red-brick apartment building', 'building-red-brick'],
  ['Floating figure', 'floating-figure'],
  ['Floating road worker', 'floating-road-worker'],
  ['Floating office worker', 'floating-office-worker'],
].map(([name, file]) => ({name, url: new URL(`${file}.webp`, import.meta.url).href}));

export function chooseDemoObjects(random = Math.random, previous = []) {
  const roll = random();
  const count = roll < .6 ? 1 : roll < .9 ? 2 : 3;
  const available = [...objectLibrary];
  const selected = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(random() * available.length);
    selected.push(...available.splice(index, 1));
  }
  if (count === previous.length && selected.every(item => previous.some(object => object.url === item.url))) {
    selected[count - 1] = available[Math.floor(random() * available.length)];
  }
  return selected;
}
