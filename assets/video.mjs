const frameRate = 24;
const bitrate = 5_000_000;
const recorderFormats = ['video/mp4;codecs=avc1', 'video/mp4;codecs=avc1.420028', 'video/webm;codecs=vp8', 'video/webm'];
const recorderType = typeof MediaRecorder !== 'undefined'
  && recorderFormats.find(type => MediaRecorder.isTypeSupported?.(type));
const canRecord = Boolean(recorderType)
  && typeof HTMLCanvasElement.prototype.captureStream === 'function';
const canUseWebCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

export const videoSupported = canUseWebCodecs || canRecord;

function makeOutput(media, codec) {
  const format = codec === 'avc' ? new media.Mp4OutputFormat({fastStart: 'in-memory'}) : new media.WebMOutputFormat();
  return new media.Output({format, target: new media.BufferTarget()});
}

function outputBlob(output) {
  if (!output.target.buffer?.byteLength) throw new Error('The browser returned an empty video.');
  return new Blob([output.target.buffer], {type: output.format.mimeType});
}

function readVideo(media, blob) {
  return new media.Input({source: new media.BlobSource(blob), formats: [media.MP4, media.WEBM]});
}

async function encodeFrames(media, codec, canvas, seconds, paint, progress, quality) {
  const output = makeOutput(media, codec);
  const source = new media.CanvasSource(canvas, {codec, quality, latencyMode: 'quality'});
  output.addVideoTrack(source, {frameRate});
  try {
    await output.start();
    const frameCount = seconds * frameRate;
    for (let frame = 0; frame < frameCount; frame++) {
      const timestamp = frame / frameRate;
      paint(timestamp * 1000);
      await source.add(timestamp, 1 / frameRate);
      if (frame % 4 === 0) {
        progress((frame + 1) / frameCount);
        // Keep the toolbar responsive without using wall-clock time for the video timeline.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    await output.finalize();
    return outputBlob(output);
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  }
}

function captureVideo(canvas, seconds, paint, progress) {
  return new Promise((resolve, reject) => {
    const stream = canvas.captureStream(frameRate);
    const chunks = [];
    let recorder, frameId, stopTimer, lastFrame = -1, failed = false;

    function cleanup() {
      cancelAnimationFrame(frameId);
      clearTimeout(stopTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      for (const track of stream.getTracks()) track.stop();
    }

    function fail(error) {
      failed = true;
      if (recorder?.state === 'recording') recorder.stop();
      cleanup();
      reject(error);
    }

    function onVisibilityChange() {
      if (document.hidden) fail(new Error('Keep this tab visible while exporting video.'));
    }

    try {
      recorder = new MediaRecorder(stream, {mimeType:recorderType, videoBitsPerSecond:bitrate});
      recorder.ondataavailable = ({data}) => { if (data.size) chunks.push(data); };
      recorder.onerror = () => fail(new Error('The browser could not record this video.'));
      recorder.onstop = () => {
        cleanup();
        if (failed) return;
        const blob = new Blob(chunks, {type: chunks[0]?.type || recorder.mimeType || recorderType});
        if (blob.size) resolve(blob);
        else reject(new Error('The browser returned an empty video.'));
      };
      recorder.start();
      document.addEventListener('visibilitychange', onVisibilityChange);
      const start = performance.now();
      const frameCount = seconds * frameRate;
      function tick(now) {
        const frame = Math.min(frameCount - 1, Math.floor(Math.max(0, now - start) * frameRate / 1000));
        try {
          if (frame > lastFrame) {
            lastFrame = frame;
            paint(frame * 1000 / frameRate);
            progress((frame + 1) / frameCount);
          }
          if (frame === frameCount - 1) {
            // Allow the final canvas paint to reach the capture track before stopping.
            stopTimer = setTimeout(() => recorder.stop(), 1000 / frameRate);
            return;
          }
          frameId = requestAnimationFrame(tick);
        } catch (error) {
          fail(error);
        }
      }
      frameId = requestAnimationFrame(tick);
    } catch (error) {
      fail(error);
    }
  });
}

async function setCapturedDuration(media, captured, seconds) {
  const input = readVideo(media, captured);
  let output;
  try {
    const track = await input.getPrimaryVideoTrack();
    const codec = await track?.getCodec();
    if (!codec) throw new Error('The browser did not return a readable video track.');
    const decoderConfig = await track.getDecoderConfig();
    const packets = [];
    let start = Infinity, end = -Infinity;
    for await (const packet of new media.EncodedPacketSink(track).packets()) {
      packets.push(packet);
      start = Math.min(start, packet.timestamp);
      end = Math.max(end, packet.timestamp + (packet.duration || 1 / frameRate));
    }
    if (packets.length < 2 || !(end > start)) throw new Error('The browser did not capture enough frames.');
    const scale = seconds / (end - start);
    output = makeOutput(media, codec);
    const source = new media.EncodedVideoPacketSource(codec);
    output.addVideoTrack(source);
    await output.start();
    for (const [index, packet] of packets.entries()) {
      const timestamp = (packet.timestamp - start) * scale;
      const duration = (packet.duration || 1 / frameRate) * scale;
      await source.add(packet.clone({timestamp, duration}), index === 0 && decoderConfig ? {decoderConfig} : undefined);
    }
    await output.finalize();
    return outputBlob(output);
  } catch (error) {
    await output?.cancel().catch(() => {});
    throw error;
  } finally {
    input.dispose();
  }
}

export async function recordVideo(canvas, seconds, paint, progress) {
  const media = await import('./mediabunny-1.65.2.mjs');
  const quality = new media.Quality({bitrate});
  const config = {width:canvas.width, height:canvas.height, frameRate, quality, latencyMode:'quality'};
  let codec;
  if (canUseWebCodecs) {
    for (const candidate of ['avc', 'vp8']) {
      if (await media.canEncodeVideo(candidate, config).catch(() => false)) {
        codec = candidate;
        break;
      }
    }
  }
  let blob;
  if (codec) {
    blob = await encodeFrames(media, codec, canvas, seconds, paint, progress, quality);
  } else if (canRecord) {
    const captured = await captureVideo(canvas, seconds, paint, progress);
    blob = await setCapturedDuration(media, captured, seconds);
  } else {
    throw new Error('Video export is unavailable in this browser.');
  }
  const input = readVideo(media, blob);
  try {
    const duration = await input.computeDuration();
    if (!Number.isFinite(duration) || Math.abs(duration - seconds) > 1 / frameRate) {
      throw new Error('The browser could not produce a video of the selected duration.');
    }
  } finally {
    input.dispose();
  }
  progress(1);
  return blob;
}
