class WebGLBlendCompositor {
  constructor(width, height) {
    this.canvas = new OffscreenCanvas(width, height);

    const gl = this.canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
      depth: false,
      stencil: false,
    });

    if (!gl) throw new Error("WebGL2 unavailable");

    this.gl = gl;
    this.width = width;
    this.height = height;

    const vertexSource = `#version 300 es
      precision highp float;

      void main() {
        vec2 p = vec2(
          float((gl_VertexID << 1) & 2),
          float(gl_VertexID & 2)
        );

        gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
      }
    `;

    const fragmentSource = `#version 300 es
      precision highp float;

      uniform sampler2D uDestination;
      uniform sampler2D uSource;
      uniform float uOpacity;
      uniform int uMode;

      out vec4 outColor;

      vec3 blend(vec3 d, vec3 s) {
        if (uMode == 0) {
          return d * s; // multiply
        }
        if (uMode == 1) {
          return d + s - d * s; // screen
        }
        if (uMode == 2) {
          return min(d, s); // darken
        }
        if (uMode == 3) {
          return max(d, s); // lighten
        }
        if (uMode == 4) {
          // color-dodge
          return vec3(
            s.r >= 1.0 ? 1.0 : min(1.0, d.r / (1.0 - s.r)),
            s.g >= 1.0 ? 1.0 : min(1.0, d.g / (1.0 - s.g)),
            s.b >= 1.0 ? 1.0 : min(1.0, d.b / (1.0 - s.b))
          );
        }
        if (uMode == 5) {
          // color-burn
          return vec3(
            s.r <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - d.r) / s.r),
            s.g <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - d.g) / s.g),
            s.b <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - d.b) / s.b)
          );
        }
        if (uMode == 6) {
          return mix(
            2.0 * d * s,
            1.0 - 2.0 * (1.0 - d) * (1.0 - s),
            step(vec3(0.5), d)
          ); // overlay
        }
        if (uMode == 7) {
          return mix(
            2.0 * d * s,
            1.0 - 2.0 * (1.0 - d) * (1.0 - s),
            step(vec3(0.5), s)
          ); // hard-light
        }
        if (uMode == 8) {
          return abs(d - s); // difference
        }
        if (uMode == 9) {
          return d + s - 2.0 * d * s; // exclusion
        }

        return s;
      }

      void main() {
        ivec2 pos = ivec2(gl_FragCoord.xy);

        vec4 d = texelFetch(uDestination, pos, 0);
        vec4 s = texelFetch(uSource, pos, 0);

        float strength = clamp(s.a * uOpacity, 0.0, 1.0);

        outColor = vec4(
          mix(d.rgb, blend(d.rgb, s.rgb), strength),
          d.a
        );
      }
    `;

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
      }
      return shader;
    };

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }

    this.program = program;

    this.modeLocation = gl.getUniformLocation(program, "uMode");
    this.opacityLocation = gl.getUniformLocation(program, "uOpacity");

    this.modes = {
      multiply: 0,
      screen: 1,
      darken: 2,
      lighten: 3,
      "color-dodge": 4,
      "color-burn": 5,
      overlay: 6,
      "hard-light": 7,
      difference: 8,
      exclusion: 9,
    };

    const makeTexture = (unit) => {
      const texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      return texture;
    };

    this.dstTexture = makeTexture(0);
    this.srcTexture = makeTexture(1);

    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, "uDestination"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uSource"), 1);

    // Canvas uploads are kept unpremultiplied.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    gl.disable(gl.BLEND);
    gl.viewport(0, 0, width, height);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
  }

  blend(destinationCanvas, sourceCanvas, mode, opacity = 1) {
    const gl = this.gl;

    if (!(mode in this.modes)) {
      throw new Error(`Unsupported blend mode: ${mode}`);
    }

    const upload = (unit, texture, canvas) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);

      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        canvas,
      );
    };

    upload(0, this.dstTexture, destinationCanvas);
    upload(1, this.srcTexture, sourceCanvas);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.uniform1i(this.modeLocation, this.modes[mode]);
    gl.uniform1f(this.opacityLocation, opacity);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    return this.canvas;
  }
}
