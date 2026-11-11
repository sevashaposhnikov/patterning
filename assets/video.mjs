const duration = 15000;
const frameRate = 24;
// Browsers can select VP9 for an unqualified MP4 request. QuickTime expects AVC here.
const formats = ['video/mp4;codecs=avc1', 'video/mp4;codecs=avc1.420028', 'video/webm;codecs=vp8', 'video/webm'];
const mimeType = typeof MediaRecorder !== 'undefined'
  && formats.find(type => MediaRecorder.isTypeSupported?.(type));

export const videoSupported = Boolean(mimeType)
  && typeof HTMLCanvasElement.prototype.captureStream === 'function';

export function recordVideo(canvas, paint, progress) {
  return new Promise((resolve, reject) => {
    const stream = canvas.captureStream(frameRate);
    let recorder, frameId, lastFrame = 0;
    const chunks = [];

    function cleanup() {
      cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      for (const track of stream.getTracks()) track.stop();
    }

    function fail(error) {
      if (recorder?.state === 'recording') recorder.stop();
      cleanup();
      reject(error);
    }

    function onVisibilityChange() {
      if (document.hidden) fail(new Error('Keep this tab visible while exporting video.'));
    }

    try {
      recorder = new MediaRecorder(stream, {mimeType, videoBitsPerSecond: 5_000_000});
      recorder.ondataavailable = ({data}) => { if (data.size) chunks.push(data); };
      recorder.onerror = () => fail(new Error('The browser could not record this video.'));
      recorder.onstop = () => {
        cleanup();
        const blob = new Blob(chunks, {type: chunks[0]?.type || recorder.mimeType || mimeType});
        if (blob.size) resolve(blob);
        else reject(new Error('The browser returned an empty video.'));
      };
      paint(0);
      recorder.start();
      document.addEventListener('visibilitychange', onVisibilityChange);
      const start = performance.now();
      function tick(now) {
        const elapsed = Math.max(0, now - start);
        if (elapsed >= duration) {
          recorder.stop();
          return;
        }
        const frame = Math.floor(elapsed * frameRate / 1000);
        if (frame > lastFrame) {
          lastFrame = frame;
          try {
            paint(elapsed);
            progress(elapsed / duration);
          } catch (error) {
            fail(error);
            return;
          }
        }
        frameId = requestAnimationFrame(tick);
      }
      frameId = requestAnimationFrame(tick);
    } catch (error) {
      fail(error);
    }
  });
}
