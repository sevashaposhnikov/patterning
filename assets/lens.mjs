const vertexSource = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const fragmentSource = `
precision mediump float;
uniform sampler2D uFrame;
uniform vec2 uAspect;
uniform float uCenterY;
varying vec2 vUv;

void main() {
  vec2 center = vec2(0.5, uCenterY);
  vec2 position = 2.0 * (vUv - center);
  vec2 radialPosition = position * uAspect;
  float radiusSquared = dot(radialPosition, radialPosition);
  // Keep the stretch gradual from the center through the corners.
  float radialScale = 1.0 - 0.18 * radiusSquared / (0.45 + radiusSquared);
  vec2 sampleUv = center + 0.5 * position * radialScale;
  gl_FragColor = texture2D(uFrame, sampleUv);
}
`;

let lens;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function createLens() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', {alpha: true, antialias: false, depth: false});
  if (!gl) return null;
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.uniform1i(gl.getUniformLocation(program, 'uFrame'), 0);
  const aspect = gl.getUniformLocation(program, 'uAspect');
  const center = gl.getUniformLocation(program, 'uCenterY');

  canvas.addEventListener('webglcontextlost', event => event.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => { lens = undefined; }, {once: true});
  return {canvas, gl, aspect, center, textureWidth: 0, textureHeight: 0, maxSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)};
}

export function applyLensDistortion(target, centerY) {
  const source = target.canvas;
  const {width, height} = source;
  if (!width || !height) return true;
  if (lens === undefined) lens = createLens();
  if (!lens || lens.gl.isContextLost() || Math.max(width, height) > lens.maxSize) return false;

  const {canvas, gl, aspect, center} = lens;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  if (lens.textureWidth !== width || lens.textureHeight !== height) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    lens.textureWidth = width;
    lens.textureHeight = height;
  } else {
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }
  gl.viewport(0, 0, width, height);
  const longestSide = Math.max(width, height);
  gl.uniform2f(aspect, width / longestSide, height / longestSide);
  gl.uniform1f(center, 1 - centerY);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalCompositeOperation = 'copy';
  target.drawImage(canvas, 0, 0);
  target.restore();
  return true;
}
