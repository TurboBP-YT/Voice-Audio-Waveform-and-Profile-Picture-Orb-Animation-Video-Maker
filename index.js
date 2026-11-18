"use strict";

// generic
function getFormData(e) {
  e.preventDefault();

  console.log("onFormSubmit");

  function getInputValue(inputElement) {
    if (inputElement.type === "file") {
      return inputElement.files[0];
    } else {
      return inputElement.value;
    }
  }

  const form = e.target;
  const fieldsets = form.querySelectorAll("fieldset");

  const formData = {};
  for (let fieldset of fieldsets) {
    const fieldName = fieldset.dataset.name;
    if (fieldset.dataset.type === "single") {
      const input = fieldset.querySelector("input");
      formData[fieldName] = getInputValue(input);
    } else if (fieldset.dataset.type === "choice") {
      const chosen = fieldset.querySelector('input[type="radio"]:checked');
      const value = chosen
        .closest("*:has(.select-value)")
        .querySelector(".select-value");
      if (value.tagName.toLowerCase() === "input") {
        formData[fieldName] = getInputValue(value);
      } else {
        formData[fieldName] = value.textContent;
      }
    }
  }

  console.log(formData);
  return formData;
}

function useFormData({ fRecording, fPfp, hexRingColor }) {
  const NAMED_IMAGES_URLS = {
    TurboBP: "./images/TurboBP.png",
  };

  const pfpSrc =
    typeof fPfp === "string"
      ? NAMED_IMAGES_URLS[fPfp]
      : URL.createObjectURL(fPfp);

  // IMAGE
  const iPfp = new Image();
  iPfp.src = pfpSrc;
  const promisePfp = iPfp
    .decode()
    .then(() => iPfp)
    .catch((error) => {
      throw new Error("Image decode error: " + error.message);
    });

  // AUDIO
  const audioContext = new AudioContext();
  const promiseRecording =
    fRecording
      ?.arrayBuffer()
      .then((arrayBuffer) => audioContext.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        if (audioBuffer.numberOfChannels !== 1) {
          throw new Error("Input audio isn’t mono");
        }
        return audioBuffer;
      }) ??
    new Promise((resolve, reject) => {
      reject(new Error("No audio file provided"));
    });

  return Promise.all([promisePfp, promiseRecording])
    .then(([iPfp, audRecording]) => {
      return { audRecording, iPfp, hexRingColor }; // renderArgs
    })
    .catch((error) => {
      console.error("Loading failed:", error.message);
      throw error; // Re-throw so the caller knows it failed
    });
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function proceedToRender(renderArgs, mode) {
  console.log(`Proceeding to render in ${mode} mode`);

  document.body.dataset.screen = "render"; // changes the active "screen"

  const prgrsBr = document.getElementById("render-progress");
  prgrsBr.min = 0;
  prgrsBr.max = 1;
  prgrsBr.value = 0;

  // video render target
  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: {
      codec: "avc", // H.264
      width: RESOLUTION.x,
      height: RESOLUTION.y,
    },
    fastStart: "in-memory",
  });
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error("VideoEncoder error:", e),
  });
  encoder.configure({
    codec: "avc1.420028",
    width: RESOLUTION.x,
    height: RESOLUTION.y,
    bitrate: 8_000_000,
    framerate: FPS,
  });

  render(
    renderArgs,
    async (canvas, idxFrame) => {
      // Wrap canvas in a VideoFrame (timestamp is in microseconds)
      const frame = new VideoFrame(canvas, {
        timestamp: (idxFrame * 1_000_000) / FPS,
        duration: 1_000_000 / FPS,
      });

      // Encode frame (force a keyframe every 2 seconds)
      encoder.encode(frame, { keyFrame: idxFrame % (FPS * 2) === 0 });
      frame.close(); // Crucial to prevent memory leaks

      // Optional: prevent backpressure buildup on heavy renders
      if (encoder.encodeQueueSize > 5) {
        await encoder.flush();
      }
    },
    (progressProportion) => {
      prgrsBr.value = progressProportion;
    },
    mode === "test",
  ).then(async () => {
    // render complete

    // 5. Finalize encoding and muxing
    await encoder.flush();
    muxer.finalize();
    if (mode === "real") {
      // 6. Create Blob and prompt user to save
      const { buffer } = muxer.target;
      const blob = new Blob([buffer], { type: "video/mp4" });
      saveBlob(blob, "wavevis.mp4");
    }
  });
}

function main() {
  const form = document.getElementById("options");
  form.addEventListener("submit", (e) => {
    const actionMode = e.submitter.dataset.mode;
    const formData = getFormData(e);
    useFormData(formData)
      .then((renderArgs) => {
        console.log(renderArgs);

        setTimeout(() => {
          // escapes promise’s try\catch context
          proceedToRender(renderArgs, actionMode);
        }, 0);
      })
      .catch((error) => {
        alert(error.message);
      });
  });
}

main();
