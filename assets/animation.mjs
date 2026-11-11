const driftDuration = 4000;
const spinDuration = 70000;
const radiansPerDegree = Math.PI / 180;

function randomPose(random) {
  return {scale: 20 + random() * 75, rotation: -120 + random() * 240};
}

function driftEnd(value, min, max, distance, direction) {
  const room = direction > 0 ? max - value : value - min;
  return room >= distance ? value + direction * distance : value - direction * distance;
}

function makeDrift(pose, random) {
  const start = {scale: pose.scale, rotation: pose.rotation};
  const direction = random() < .5 ? -1 : 1;
  const end = {
    scale: driftEnd(start.scale, 0, 100, 8 + random() * 8, direction),
    rotation: driftEnd(start.rotation, -120, 120, 15 + random() * 16, direction),
  };
  return {start, end, tremorDuration: random() < .5 ? 400 : 800};
}

export function createCycle(pose, random = Math.random) {
  const passes = [makeDrift(pose, random), makeDrift(randomPose(random), random)];
  const secondPassStart = driftDuration + passes[0].tremorDuration;
  const burstStart = secondPassStart + driftDuration + passes[1].tremorDuration;
  const jumpCount = random() < .5 ? 3 : 5;
  const jumpInterval = jumpCount === 3 ? 260 : 125;
  const jumps = Array.from({length: jumpCount}, () => ({
    pose: randomPose(random),
    glitch: {
      density: 6 + 2 * Math.floor(random() * 13),
      size: 40 + Math.floor(random() * 121),
    },
  }));
  const doubleExposure = {
    start: 1500 + random() * 1850,
    duration: 90 + random() * 50,
    direction: random() < .5 ? -1 : 1,
  };
  const spinGlitch = {
    start: secondPassStart + 550 + random() * 2400,
    duration: 180 + random() * 100,
    jump: (7 + random() * 7) * (random() < .5 ? -1 : 1) * radiansPerDegree,
    reverse: (6 + random() * 4) * radiansPerDegree,
  };
  return {passes, secondPassStart, burstStart, jumpInterval, jumps, doubleExposure, spinGlitch, duration: burstStart + jumpCount * jumpInterval};
}

export function sampleCycle(cycle, elapsed) {
  const exposure = cycle.doubleExposure;
  const exposureProgress = (elapsed - exposure.start) / exposure.duration;
  const doubleExposure = exposureProgress > 0 && exposureProgress < 1 ? {
    direction: exposure.direction,
    strength: Math.sin(Math.PI * exposureProgress) ** .65,
  } : null;
  const spin = cycle.spinGlitch;
  const spinProgress = (elapsed - spin.start) / spin.duration;
  const spinOffset = spinProgress >= 0 && spinProgress < 1 ? spin.jump - spin.reverse * spinProgress : 0;
  if (elapsed >= cycle.burstStart) {
    const jump = Math.min(cycle.jumps.length - 1, Math.floor((elapsed - cycle.burstStart) / cycle.jumpInterval));
    return {...cycle.jumps[jump], tremor: null, doubleExposure, spinOffset};
  }
  const secondPass = elapsed >= cycle.secondPassStart;
  const time = secondPass ? elapsed - cycle.secondPassStart : elapsed;
  const {start, end, tremorDuration} = cycle.passes[Number(secondPass)];
  if (time >= driftDuration) {
    const tremorTime = time - driftDuration;
    return {pose: end, tremor: {progress: tremorTime / tremorDuration, time: tremorTime}, glitch: null, doubleExposure, spinOffset};
  }
  const progress = time / driftDuration;
  return {
    pose: {
      scale: start.scale + (end.scale - start.scale) * progress,
      rotation: start.rotation + (end.rotation - start.rotation) * progress,
    },
    tremor: null,
    glitch: null,
    doubleExposure,
    spinOffset,
  };
}

export function shakeItems(items, tremor) {
  if (!tremor) return items;
  const {progress, time} = tremor;
  const amplitude = progress ** 1.6;
  const oscillation = 2 * Math.PI * time / 1000 * (9.5 + 2.5 * progress);
  return items.map((item, index) => {
    const phase = index * 2.39996;
    return {
      ...item,
      x: item.x + .007 * amplitude * Math.sin(oscillation + phase),
      y: item.y + .006 * amplitude * Math.cos(oscillation * .83 + phase),
      rotation: item.rotation + .021 * amplitude * Math.sin(oscillation * 1.06 + phase * 2),
    };
  });
}

export function spinItems(items, elapsed, offset = 0) {
  const angle = elapsed % spinDuration / spinDuration * 2 * Math.PI + offset;
  if (angle === 0) return items;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return items.map(item => {
    const direction = item.spinDirection;
    const signedAngle = angle * direction;
    const signedSin = sin * direction;
    return {
      ...item,
      x: item.x * cos - item.y * signedSin,
      y: item.x * signedSin + item.y * cos,
      rotation: item.rotation + signedAngle,
      azimuth: item.azimuth + signedAngle,
    };
  });
}

export function sampleLightPulse(elapsed) {
  // A cosine eases both ends of the pulse and continues across animation cycles.
  return (1 - Math.cos(2 * Math.PI * elapsed / 5600)) / 2;
}
