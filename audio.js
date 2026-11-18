"use strict";

/**
 * Slices an array from `start` to `end` (exclusive), padding out-of-bounds
 * indices with a fill value (defaults to 0).
 */
function sliceWithPadding(arr, start, end, padValue = 0) {
  const length = Math.max(0, end - start);

  return Array.from({ length }, (_, i) => {
    const index = start + i;
    return index >= 0 && index < arr.length ? arr[index] : padValue;
  });
}

async function resample(audioBuf, newSampleRate) {
  const nChannels = audioBuf.numberOfChannels;
  const inputSampleRate = audioBuf.sampleRate;
  const targetLength = audioBuf.length;

  const src = await LibSampleRate.create(
    nChannels,
    inputSampleRate,
    newSampleRate,
    {
      converterType: LibSampleRate.ConverterType.SRC_SINC_BEST_QUALITY,
    },
  );

  try {
    // Interleave input channels
    const input = new Float32Array(targetLength * nChannels);
    const channels = Array.from({ length: nChannels }, (_, ch) =>
      audioBuf.getChannelData(ch),
    );

    for (let i = 0; i < targetLength; i++) {
      for (let ch = 0; ch < nChannels; ch++) {
        input[i * nChannels + ch] = channels[ch][i];
      }
    }

    // Resample
    const result = src.full(input);
    const output = result instanceof Float32Array ? result : result[0];

    const outputLength = output.length / nChannels;
    const copyLength = Math.min(targetLength, outputLength);

    // Always use the original sample count
    const resampledAudBuf = new AudioBuffer({
      numberOfChannels: nChannels,
      length: targetLength,
      sampleRate: newSampleRate,
    });

    // Copy samples, truncate excess, zero-pad remainder
    for (let ch = 0; ch < nChannels; ch++) {
      const channelData = resampledAudBuf.getChannelData(ch);

      for (let i = 0; i < copyLength; i++) {
        channelData[i] = output[i * nChannels + ch];
      }

      // Remaining samples are already initialized to zero
    }

    return resampledAudBuf;
  } finally {
    src.destroy();
  }
}

function rms(arr) {
  const len = arr.length;
  if (len === 0) return 0;

  let sumOfSquares = 0;
  for (let i = 0; i < len; i++) {
    const val = arr[i];
    sumOfSquares += val * val;
  }

  return Math.sqrt(sumOfSquares / len);
}

function hannWinRms(a) {
  // 1. Precompute once
  function createHannWindow(size) {
    const win = new Float32Array(size);
    const factor = (2 * Math.PI) / (size - 1);
    for (let i = 0; i < size; i++) {
      win[i] = 0.5 * (1 - Math.cos(factor * i));
    }
    return win;
  }

  // 2. Hot-loop multiplication (V8 auto-vectorizes this)
  function applyWindow(signal, window, out, normalize = false) {
    const m = normalize ? rms(window) : 1;
    const len = signal.length;
    for (let i = 0; i < len; i++) {
      out[i] = (signal[i] * window[i]) / m;
    }
  }

  const w = createHannWindow(a.length);
  const ret = new Array(a.length).fill(0);
  applyWindow(a, w, ret, true);
  return rms(ret);
}

function hannWinRmsAtApproxTime(a, t, winLen) {
  // approximation ! no fractional sample positions
  if (winLen % 2 !== 1) {
    throw new Error("hannWinRmsAtApproxTime : window length must be odd");
  }
  const extension = Math.floor(winLen / 2);
  t = Math.round(t);
  return hannWinRms(sliceWithPadding(a, t - extension, t + 1 + extension));
}

function callOnTimeSeriesAtTimes(arr, times, func, ...args) {
  const ret = new Array(arr.length).fill(0);
  for (let [i, t] of times.entries()) {
    ret[i] = func(arr, t, ...args);
  }
  return ret;
}
