"use strict";

// CONSTANTS
const PREVIEW_EVERY_N_FRAMES = 10;

const FPS = 60;
const RESOLUTION = { x: 1080, y: 1920 };
const res_min = Math.min(RESOLUTION.x, RESOLUTION.y);
const N_FRAMES_OF_AUDIO_ON_SCREEN = 9; // must be an odd number that divides RESOLUTION.x
const FILLS_DUR_RMS_WIN_S = 1 / 90;
const ORB_DUR_RMS_WIN_S = 1 / 4;
const FILLS_PRECISION_RES_PX = 3;
const BLOOM_MAX_RADIUS = 0.125;
const BLOOM_INTENSITY = 1 / 3;

const PFP_RADIUS = 0.15;
const PFP_RING_GAP = 0.015;
const RING_THICK = 0.025;
const ring_outer_radius = PFP_RADIUS + PFP_RING_GAP + RING_THICK;
const RING_ORB_GAP = 0.02;
const orb_min_radius = PFP_RADIUS + PFP_RING_GAP + RING_THICK + RING_ORB_GAP;
const ORB_MAX_RADIUS = 1.5 / 2;
const ORB_MIN_THICK = 0.03;
const ORB_INFLECTION_THICK = 0.04;
const rms_at_which_orb_reaches_full_brightness =
  ORB_INFLECTION_THICK / (ORB_MAX_RADIUS - orb_min_radius);
const waveform_max_height = 2 * ring_outer_radius;
const COLOR_BASIC_WAVEFORM = "#c0d0e0";
const COLOR_BG = "#000000";
const COLOR_RING_COLOR_DARKEN_MULTIPLIER = "#a0a0a0";
const COLOR_ORB = "#202730";
const NON_VIGNETTED_PROPORTION = 7 / 8;
const COLOR_VIGNETTE = "#b0b0b0";
const ORB_GLOW_BOUNDARY_SOFT = 0.025;
const WAVE_LINE_THICK_PX = 2;
const n_wave_frames_cover_ring =
  1 +
  2 *
    Math.ceil(
      Math.max(
        0,
        (ring_outer_radius - 1 / N_FRAMES_OF_AUDIO_ON_SCREEN / 2) /
          (1 / N_FRAMES_OF_AUDIO_ON_SCREEN),
      ),
    );

//

class WaveformFrame {
  // 1 frame’s worth of audio visualization
  constructor(
    displayableLowPassSignal,
    fineDetailHighPassSignal,
    nSamplesPerFrame,
    ringFillRmsSequence,
    frameNumber,
  ) {
    this.displayableLowPassSignal = displayableLowPassSignal; // wavelengths > 1 px drawn as squiggly line waveform
    this.fineDetailHighPassSignal = fineDetailHighPassSignal; // wavelengths < 1 px drawn as solid envelope
    this.nSamplesPerFrame = nSamplesPerFrame;
    this.ringFillRmsSequence = ringFillRmsSequence;
    this.frameNumber = frameNumber;
  }
  paintWave() {
    const ctx = this.canvasWave.getContext("2d");
    const W = this.canvasWave.width;
    const H = this.canvasWave.height;
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    const xPxToSamp = (xPx) =>
      (this.frameNumber + xPx / W) * this.nSamplesPerFrame;

    const top = [];
    const bottom = [];
    for (let xPx = 0; xPx <= W; ++xPx) {
      const tSampInt = Math.round(xPxToSamp(xPx));
      const y = sliceWithPadding(
        this.displayableLowPassSignal,
        tSampInt,
        tSampInt + 1,
      )[0];

      // uses fill to represent high frequency information too fine to draw with line
      const hf = sliceWithPadding(
        this.fineDetailHighPassSignal,
        Math.ceil(xPxToSamp(xPx - 0.5)),
        Math.floor(xPxToSamp(xPx + 0.5)) + 1,
      );
      let maxHf = 0;
      for (const v of hf) maxHf = Math.max(maxHf, Math.abs(v));

      const yPx = mapRange(y, -1, 1, H, 0);
      const hPx = maxHf * (H / 2);
      top.push([xPx, yPx - hPx]);
      bottom.push([xPx, yPx + hPx]);
    }

    // FILL envelope (no clip needed)
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.moveTo(...top[0]);
    for (const [x, y] of top) ctx.lineTo(x, y);
    for (const [x, y] of bottom.toReversed()) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();

    // OUTLINE
    ctx.lineWidth = WAVE_LINE_THICK_PX;
    ctx.strokeStyle = "white";
    for (const edge of [top, bottom]) {
      ctx.beginPath();
      ctx.moveTo(...edge[0]);
      for (const [x, y] of edge) ctx.lineTo(x, y);
      ctx.stroke();
    }

    ctx.restore();
  }
  paintRing() {
    const ctx = this.canvasRing.getContext("2d");
    const W = this.canvasRing.width;
    const H = this.canvasRing.height;
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    const gradient = ctx.createLinearGradient(-W, 0, 2 * W, 0);
    const idxEarliestRms = Math.max(
      0,
      Math.floor((this.frameNumber * W) / FILLS_PRECISION_RES_PX),
    );
    const idxLatestRms = Math.min(
      this.ringFillRmsSequence.length - 1,
      Math.ceil(((this.frameNumber + 1) * W) / FILLS_PRECISION_RES_PX),
    );
    for (
      let idxInRmsSeq = idxEarliestRms;
      idxInRmsSeq <= idxLatestRms;
      ++idxInRmsSeq
    ) {
      gradient.addColorStop(
        mapRange(
          FILLS_PRECISION_RES_PX * idxInRmsSeq - this.frameNumber * W,
          0,
          W,
          1 / 3,
          2 / 3,
          false,
        ),
        `hsl(0deg,0%,${100 * (1 - (1 - this.ringFillRmsSequence[idxInRmsSeq]) ** 2)}%)`,
      );
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    ctx.restore();
  }
  paintColor() {}
  paint() {
    this.paintWave();
    this.paintRing();
    this.paintColor();
  }
  bind(canvasWave, canvasRing, canvasColor) {
    this.canvasWave = canvasWave;
    this.canvasRing = canvasRing;
    this.canvasColor = canvasColor;
    this.paint();
  }
}

class Layer {
  constructor(
    { x: width, y: height },
    drawFunc,
    blendMode = "source-over",
    alpha = 1.0,
  ) {
    this.canvas = new OffscreenCanvas(width, height);
    this.canvas.ctx = this.canvas.getContext("2d");
    this.drawFunc = drawFunc;
    this.blendMode = blendMode;
    this.alpha = alpha;
  }
  draw(...args) {
    this.canvas.ctx.save();
    this.canvas.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawFunc(this.canvas.ctx, ...args);
    this.canvas.ctx.restore();
  }
}

class LayerGroup {
  constructor(
    { x: width, y: height },
    children,
    blendMode = "source-over",
    alpha = 1.0,
    nRepeatPaints = 0,
  ) {
    this.canvas = new OffscreenCanvas(width, height);
    this.canvas.ctx = this.canvas.getContext("2d");
    this.canvas2 = new OffscreenCanvas(width, height);
    this.canvas2.ctx = this.canvas2.getContext("2d");
    this.children = children;
    this.blendMode = blendMode;
    this.alpha = alpha;
    this.nRepeatPaints = nRepeatPaints;
  }
  composite() {
    this.canvas.ctx.save();
    this.canvas.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (let child of this.children.toReversed()) {
      // array order : first is on top
      if (child instanceof MixFiltersOverlay) {
        child.applyTo(this.canvas);
        continue;
      } else if (child instanceof LayerGroup) {
        child.composite();
      }
      const isColorBasedBlendMode = [
        "lighter",
        "multiply",
        "screen",
        "overlay",
        "darken",
        "lighten",
        "color-dodge",
        "color-burn",
        "hard-light",
        "soft-light",
        "difference",
        "exclusion",
        "hue",
        "saturation",
        "color",
        "luminosity",
      ].includes(child.blendMode);
      for (let nPaint = 0; nPaint < 1 + this.nRepeatPaints; nPaint++) {
        this.canvas.ctx.globalAlpha = child.alpha;
        this.canvas.ctx.globalCompositeOperation = child.blendMode;
        if (isColorBasedBlendMode) {
          this.canvas2.ctx.clearRect(
            0,
            0,
            this.canvas2.width,
            this.canvas2.height,
          );
          this.canvas2.ctx.drawImage(this.canvas, 0, 0);
        }
        this.canvas.ctx.drawImage(child.canvas, 0, 0);
        if (isColorBasedBlendMode) {
          this.canvas.ctx.globalCompositeOperation = "destination-in";
          this.canvas.ctx.drawImage(this.canvas2, 0, 0);
        }
      }
    }
    this.canvas.ctx.restore();
  }
}

class MixFiltersOverlay {
  constructor(
    { x: width, y: height },
    filtersStrings,
    blendMode = "source-over",
    alpha = 1.0,
  ) {
    this.filtersStrings = filtersStrings;
    this.blendMode = blendMode;
    this.alpha = alpha;

    this.canvases = [];
    for (let filterStr of this.filtersStrings) {
      const canvas = new OffscreenCanvas(width, height);
      canvas.ctx = canvas.getContext("2d");
      canvas.ctx.filter = filterStr;
      this.canvases.push(canvas);
    }
  }
  applyTo(underLayerCanvas) {
    for (const cvs of this.canvases) {
      const ctx = cvs.ctx;
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      ctx.drawImage(underLayerCanvas, 0, 0);
    }

    const internalCanvas0 = this.canvases[0];
    var ctx = internalCanvas0.ctx;
    ctx.save();
    ctx.filter = "none";
    for (const [i, cvs] of this.canvases.entries()) {
      if (i <= 0) continue; // skips the 1st canvas, which is used as the draw destination
      ctx.globalAlpha = 1 / (i + 1);
      ctx.drawImage(cvs, 0, 0);
      ctx.globalAlpha;
    }
    ctx.restore();

    ctx = underLayerCanvas.ctx;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.globalCompositeOperation = this.blendMode;
    ctx.drawImage(internalCanvas0, 0, 0);
    ctx.restore();
  }
}

//

function useRelativeCoordinateSpace(ctx, func) {
  ctx.save();
  ctx.translate(RESOLUTION.x / 2, RESOLUTION.y / 2);
  ctx.scale(res_min, res_min);
  func();
  ctx.restore();
}

function stepForwardWaveformFrames(waveformFrames) {
  const last = waveformFrames.at(-1);
  const newFrame = new WaveformFrame(
    last.displayableLowPassSignal,
    last.fineDetailHighPassSignal,
    last.nSamplesPerFrame,
    last.ringFillRmsSequence,
    last.frameNumber + 1,
  );
  const oldest = waveformFrames.shift();

  // reuse offscreen canvases
  newFrame.bind(oldest.canvasWave, oldest.canvasRing, oldest.canvasColor);

  waveformFrames.push(newFrame);
}

/**
 * Monotone Cubic Hermite interpolation between two points (Fritsch-Carlson).
 *
 * @param {number} x0 - Start X coordinate
 * @param {number} y0 - Start Y coordinate
 * @param {number} m0 - Slope at start point
 * @param {number} x1 - End X coordinate (must be > x0)
 * @param {number} y1 - End Y coordinate
 * @param {number} m1 - Slope at end point
 * @param {number} x  - Query X coordinate in [x0, x1]
 * @returns {number} Interpolated Y value
 */
function monotoneCubicInterpolate(x0, y0, m0, x1, y1, m1, x) {
  const h = x1 - x0;
  if (h === 0) return y0;

  const delta = (y1 - y0) / h;

  // Enforce monotonicity by adjusting slopes if necessary
  let m0Adj = m0;
  let m1Adj = m1;

  if (
    delta === 0 ||
    Math.sign(m0) !== Math.sign(delta) ||
    Math.sign(m1) !== Math.sign(delta)
  ) {
    m0Adj = 0;
    m1Adj = 0;
  } else {
    const alpha = m0 / delta;
    const beta = m1 / delta;
    const hypotSq = alpha * alpha + beta * beta;

    if (hypotSq > 9) {
      const tau = 3 / Math.sqrt(hypotSq);
      m0Adj = tau * m0;
      m1Adj = tau * m1;
    }
  }

  // Normalize x to t in [0, 1] and evaluate Hermite basis functions
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return h00 * y0 + h10 * h * m0Adj + h01 * y1 + h11 * h * m1Adj;
}

// LAYERS’ DRAW FUNCTIONS

function drawSolidFill(ctx, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, RESOLUTION.x, RESOLUTION.y);
}

function drawFillCircleAtCenter(ctx, radius, color) {
  useRelativeCoordinateSpace(ctx, () => {
    // 1. Start a new path
    ctx.beginPath();

    // 2. Define the circle: arc(x, y, radius, startAngle, endAngle)
    ctx.arc(0, 0, radius, 0, Math.PI * 2);

    // 3. Set the fill color and draw it
    ctx.fillStyle = color;
    ctx.fill();
  });
}

function drawLayerPfp(ctx, iPfp) {
  // GAP
  drawFillCircleAtCenter(ctx, PFP_RING_GAP + PFP_RADIUS, COLOR_BG);

  // PICTURE
  useRelativeCoordinateSpace(ctx, () => {
    // 1. Save the default canvas state
    ctx.save();

    // 2. Define the circular path
    ctx.beginPath();
    ctx.arc(0, 0, PFP_RADIUS, 0, Math.PI * 2, true);
    ctx.closePath();

    // 3. Turn the path into a clipping mask
    ctx.clip();

    // 4. Draw the image inside the clipped area
    ctx.drawImage(
      iPfp,
      -PFP_RADIUS,
      -PFP_RADIUS,
      PFP_RADIUS * 2,
      PFP_RADIUS * 2,
    );

    // 5. Restore the canvas state so future drawings aren't clipped
    ctx.restore();
  });
}

function drawLayerVignette(ctx) {
  ctx.fillStyle = COLOR_VIGNETTE;
  ctx.fillRect(0, 0, RESOLUTION.x, RESOLUTION.y);
  useRelativeCoordinateSpace(ctx, () => {
    // 1. Create radial gradient: (x0, y0, r0, x1, y1, r1)
    const gradient = ctx.createRadialGradient(
      0,
      0,
      NON_VIGNETTED_PROPORTION / 2,
      0,
      0,
      1 / 2,
    );

    // 2. Add color stops (offset from 0.0 to 1.0)
    gradient.addColorStop(0, "white");
    gradient.addColorStop(1, COLOR_VIGNETTE);

    // 3. Apply gradient to fillStyle and draw a shape
    ctx.fillStyle = gradient;
    ctx.fillRect(-0.51, -0.51, 1.02, 1.02);
  });
}

function drawLayerOrbGlow(ctx, canvasOrbMask) {
  drawSolidFill(ctx, COLOR_VIGNETTE);

  ctx.globalCompositeOperation = "screen";
  ctx.filter = `blur(${res_min * ORB_GLOW_BOUNDARY_SOFT}px)`;
  ctx.drawImage(canvasOrbMask, 0, 0);
}

function drawLayerOrbMask(ctx, rms) {
  // orb is a ring not a solid circle
  // mask means this layer is black & white no transparent bg

  drawSolidFill(ctx, "black");

  // radius pulsing at loud volumes and brightness breathing at quiet volumes
  const radius =
    rms >= rms_at_which_orb_reaches_full_brightness
      ? mapRange(
          rms,
          rms_at_which_orb_reaches_full_brightness,
          1,
          orb_min_radius + ORB_INFLECTION_THICK,
          ORB_MAX_RADIUS,
          true,
        )
      : monotoneCubicInterpolate(
          0,
          orb_min_radius + ORB_MIN_THICK,
          0,
          rms_at_which_orb_reaches_full_brightness,
          orb_min_radius + ORB_INFLECTION_THICK,
          (orb_min_radius + ORB_INFLECTION_THICK - ORB_MAX_RADIUS) /
            (1 - rms_at_which_orb_reaches_full_brightness),
          rms,
        );
  const alpha = lerp(
    0,
    1,
    rms / rms_at_which_orb_reaches_full_brightness,
    true,
  );
  drawFillCircleAtCenter(ctx, radius, `hsl(0deg,0%,${100 * alpha}%)`);
  drawFillCircleAtCenter(ctx, orb_min_radius, "black");
}

function drawLayerWaveFade(ctx, img) {
  /*
  drawFillCircleAtCenter(ctx, orb_min_radius, COLOR_BG);
  useRelativeCoordinateSpace(ctx, () => {
    const gradient = ctx.createLinearGradient(
      -orb_min_radius,
      0,
      orb_min_radius,
      0,
    );

    gradient.addColorStop(0, "transparent");
    gradient.addColorStop(
      (orb_min_radius - ring_outer_radius) / (2 * orb_min_radius) / 2,
      COLOR_BG,
    );
    gradient.addColorStop(
      1 - (orb_min_radius - ring_outer_radius) / (2 * orb_min_radius) / 2,
      COLOR_BG,
    );
    gradient.addColorStop(1, "transparent");

    ctx.fillStyle = gradient;
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillRect(-0.51, -0.51, 1.02, 1.02);
  });
  */
  useRelativeCoordinateSpace(ctx, () => {
    ctx.drawImage(
      img,
      -orb_min_radius,
      -orb_min_radius,
      2 * orb_min_radius,
      2 * orb_min_radius,
    );
  });
}

function drawLayerRingFill(ctx, waveformFrames) {
  drawSolidFill(ctx, "black");
  const waveFrameIdxStartsToCoverRing =
    Math.floor(waveformFrames.length / 2) -
    Math.floor(n_wave_frames_cover_ring / 2);
  const waveFrameIdxStopsCoverRing =
    Math.ceil(waveformFrames.length / 2) +
    Math.floor(n_wave_frames_cover_ring / 2);
  for (let [index, waveFrame] of Array.from(waveformFrames.entries()).slice(
    waveFrameIdxStartsToCoverRing,
    waveFrameIdxStopsCoverRing,
  )) {
    ctx.drawImage(
      waveFrame.canvasRing,
      index * waveFrame.canvasRing.width,
      0,
      waveFrame.canvasRing.width,
      RESOLUTION.y,
    );
  }
}

function drawLayerWaveform(ctx, waveformFrames) {
  for (let [index, waveFrame] of waveformFrames.entries()) {
    ctx.drawImage(
      waveFrame.canvasWave,
      index * waveFrame.canvasWave.width,
      RESOLUTION.y / 2 - waveFrame.canvasWave.height / 2,
    );
  }
}

function drawLayerWaveformColor(ctx) {
  // TODO : FL studio style waveform color
  drawSolidFill(ctx, COLOR_BASIC_WAVEFORM); // uncolored waveform
}

//

async function render(
  { audRecording, iPfp, hexRingColor },
  videoBufferWriteFunc,
  progressBarSetFunc,
  isTest = false,
) {
  // SETUP
  const durAudioOnScreen = N_FRAMES_OF_AUDIO_ON_SCREEN / FPS;
  console.info(
    `Duration of audio visualized on screen at a time: ${durAudioOnScreen} seconds`,
  );

  const img = (src) => {
    const img = new Image();
    img.src = src;
    return {
      image: img,
      promise: img.decode(),
    };
  };
  const IMAGES = {
    "center-wave-fade": img("images/center-wave-fade.png"),
  };
  await Promise.all(
    Array.from(Object.values(IMAGES)).map(({ promise }) => promise),
  ); // waits for all images to load
  console.log("Images Loaded");

  const nFrames = Math.ceil(audRecording.duration * FPS);

  const waveformFrameWidthPx = RESOLUTION.x / N_FRAMES_OF_AUDIO_ON_SCREEN;
  const waveformCanvasHeightPx = roundToNearestEven(
    res_min * waveform_max_height,
  );

  const samplePosPerFrame = Array(nFrames).fill(0);
  for (let idxFrame = 0; idxFrame < nFrames; ++idxFrame) {
    samplePosPerFrame[idxFrame] = (idxFrame / FPS) * audRecording.sampleRate;
  }
  const _pf_orbRmsStart = performance.now();
  const precomputedOrbRmsPerFrame = callOnTimeSeriesAtTimes(
    audRecording.getChannelData(0),
    samplePosPerFrame,
    hannWinRmsAtApproxTime,
    roundToNearestOdd(ORB_DUR_RMS_WIN_S * audRecording.sampleRate),
  );
  const _pf_orbRmsEnd = performance.now();
  console.info(
    `Calculated per-frame RMS on ${audRecording.duration} seconds of audio in ${_pf_orbRmsEnd - _pf_orbRmsStart} ms`,
  );

  //const precomputedWaveColorGradient;

  const samplePosPerRingGradientStop = Array(
    Math.ceil((nFrames * waveformFrameWidthPx) / FILLS_PRECISION_RES_PX),
  ).fill(0);
  for (
    let idxRingGradientStop = 0;
    idxRingGradientStop < samplePosPerRingGradientStop.length;
    ++idxRingGradientStop
  ) {
    samplePosPerRingGradientStop[idxRingGradientStop] =
      ((idxRingGradientStop * FILLS_PRECISION_RES_PX) /
        waveformFrameWidthPx /
        FPS) *
      audRecording.sampleRate;
  }
  const _pf_ringRmsStart = performance.now();
  const precomputedRmsRingGradient = callOnTimeSeriesAtTimes(
    audRecording.getChannelData(0),
    samplePosPerRingGradientStop,
    hannWinRmsAtApproxTime,
    roundToNearestOdd(FILLS_DUR_RMS_WIN_S * audRecording.sampleRate),
  );
  const _pf_ringRmsEnd = performance.now();
  console.info(
    `Calculated per-${FILLS_PRECISION_RES_PX}px RMS on ${audRecording.duration} seconds of audio in ${_pf_ringRmsEnd - _pf_ringRmsStart} ms`,
  );

  const _pf_resampleStart = performance.now();
  const pixelAlignedAudBuf = await resample(
    audRecording,
    RESOLUTION.x / durAudioOnScreen,
  );
  const displayableLowPassSignal = (
    await resample(pixelAlignedAudBuf, audRecording.sampleRate)
  ).getChannelData(0);
  const _pf_resampleEnd = performance.now();
  console.info(
    `Resampled ${audRecording.duration} seconds of audio in ${_pf_resampleEnd - _pf_resampleStart} ms`,
  );
  const originalSignal = audRecording.getChannelData(0);
  const fineDetailHighPassSignal = new Float32Array(originalSignal.length);
  for (let i = 0; i < fineDetailHighPassSignal.length; i++) {
    fineDetailHighPassSignal[i] =
      originalSignal[i] - displayableLowPassSignal[i];
  }

  const viewerCanvas = document.getElementById("viewer");
  viewerCanvas.width = RESOLUTION.x;
  viewerCanvas.height = RESOLUTION.y;
  viewerCanvas.ctx = viewerCanvas.getContext("2d");

  const nWaveformFramesBehindNow = Math.floor(N_FRAMES_OF_AUDIO_ON_SCREEN / 2);
  const nSamplesPerFrame = audRecording.sampleRate / FPS;
  // init first batch of waveform frames
  const waveformFrames = [];
  for (let i = 0; i < N_FRAMES_OF_AUDIO_ON_SCREEN; ++i) {
    const wff = new WaveformFrame(
      displayableLowPassSignal,
      fineDetailHighPassSignal,
      nSamplesPerFrame,
      precomputedRmsRingGradient,
      i - nWaveformFramesBehindNow,
    );
    wff.bind(
      new OffscreenCanvas(waveformFrameWidthPx, waveformCanvasHeightPx),
      new OffscreenCanvas(waveformFrameWidthPx, 1),
      new OffscreenCanvas(waveformFrameWidthPx, 1),
    );
    waveformFrames.push(wff);
  }

  // LAYERS
  var layerPfp,
    layerRingFillMultiplyColor,
    layerRingCircle,
    layerWaveform,
    layerWaveformVignette,
    layerWaveformColor,
    layerOrbMultiplyColor,
    layerBg,
    layerOrbMask,
    layerOrbGlow,
    layerRingFill,
    layerWaveFade,
    layerRingColorDarken;
  const rootLayer = new LayerGroup(RESOLUTION, [
    (layerPfp = new Layer(RESOLUTION, drawLayerPfp)), // Profile Picture
    new MixFiltersOverlay( // Bloom
      RESOLUTION,
      [
        `blur(${res_min * BLOOM_MAX_RADIUS}px)`,
        `blur(${(res_min * BLOOM_MAX_RADIUS) / 3}px)`,
        `blur(${(res_min * BLOOM_MAX_RADIUS) / 3 ** 2}px)`,
      ],
      "screen",
      BLOOM_INTENSITY,
    ),
    new LayerGroup(RESOLUTION, [
      new LayerGroup(
        RESOLUTION,
        [
          (layerRingFillMultiplyColor = new Layer(
            RESOLUTION,
            drawSolidFill,
            "multiply",
          )), // Ring Fill Dodge Intensity Control
          (layerRingFill = new Layer(RESOLUTION, drawLayerRingFill)), // Ring Fill
        ],
        "color-dodge",
        1,
        10,
      ),
      (layerRingColorDarken = new Layer(RESOLUTION, drawSolidFill, "multiply")), // Ring Color Darken
      (layerRingCircle = new Layer(RESOLUTION, drawFillCircleAtCenter)), // Ring Base Circle
    ]),
    new MixFiltersOverlay( // Micro-Bloom
      RESOLUTION,
      [`blur(${2}px)`],
      "screen",
      BLOOM_INTENSITY,
    ),
    new LayerGroup(RESOLUTION, [
      (layerWaveFade = new Layer(RESOLUTION, drawLayerWaveFade, "multiply")), // Waveform Fade into Ring
      (layerOrbGlow = new Layer(RESOLUTION, drawLayerOrbGlow, "multiply")), // Orb Glow
      (layerWaveformVignette = new Layer(
        RESOLUTION,
        drawLayerVignette,
        "multiply",
      )), // Vignette
      (layerWaveformColor = new Layer(
        RESOLUTION,
        drawLayerWaveformColor,
        "multiply",
      )), // Waveform Color Fill
      (layerWaveform = new Layer(RESOLUTION, drawLayerWaveform)), // Waveform
    ]),
    (layerOrbMultiplyColor = new Layer(RESOLUTION, drawSolidFill, "multiply")), // Orb Color
    (layerOrbMask = new Layer(RESOLUTION, drawLayerOrbMask)), // Orb Mask
    (layerBg = new Layer(RESOLUTION, drawSolidFill)), // Background
  ]);

  // DRAW STATIC LAYERS
  layerBg.draw(COLOR_BG);
  layerPfp.draw(iPfp);
  layerRingCircle.draw(ring_outer_radius, hexRingColor);
  layerRingColorDarken.draw(COLOR_RING_COLOR_DARKEN_MULTIPLIER);
  layerWaveFade.draw(IMAGES["center-wave-fade"].image);
  layerRingFillMultiplyColor.draw("#fefefe");
  layerWaveformVignette.draw();
  layerOrbMultiplyColor.draw(COLOR_ORB);
  layerWaveformColor.draw(); // TODO : make dynamic

  return await new Promise((resolve, reject) => {
    // RENDER
    function renderFrame(frameNumber) {
      if (frameNumber >= nFrames) {
        resolve();
        return;
      }

      const t = frameNumber / FPS;

      //

      layerWaveform.draw(waveformFrames);
      layerRingFill.draw(waveformFrames);

      layerOrbMask.draw(precomputedOrbRmsPerFrame[frameNumber]);
      layerOrbGlow.draw(layerOrbMask.canvas);

      rootLayer.composite();

      //

      stepForwardWaveformFrames(waveformFrames);

      if (!isTest) {
        videoBufferWriteFunc(rootLayer.canvas, frameNumber);
      }

      const next = () => {
        renderFrame(frameNumber + 1);
      };
      if (
        isTest ||
        frameNumber % PREVIEW_EVERY_N_FRAMES === 0 ||
        frameNumber === nFrames - 1
      ) {
        // refresh UI
        viewerCanvas.ctx.drawImage(rootLayer.canvas, 0, 0);
        progressBarSetFunc((1 + frameNumber) / nFrames);

        isTest ? requestAnimationFrame(next) : setTimeout(next, 0);
        return;
      }
      next();
    }
    renderFrame(0); // starts rendering
  });
}
