const TYPE_CAMERA_JPEG = 0x01;
const TYPE_AUDIO_PCM = 0x02;
const TYPE_AUDIO_IMA_ADPCM = 0x03;
const ADPCM_HEADER_SIZE = 13;
const AUDIO_START_BUFFER_SECONDS = 0.18;
const AUDIO_MAX_BUFFER_SECONDS = 0.75;

const STEP_TABLE = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31,
  34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130,
  143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449,
  494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411,
  1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026,
  4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
  11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623,
  27086, 29794, 32767,
];

const INDEX_TABLE = [
  -1, -1, -1, -1, 2, 4, 6, 8,
  -1, -1, -1, -1, 2, 4, 6, 8,
];

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function decodeImaAdpcmPacket(packet: ArrayBuffer): Float32Array {
  if (packet.byteLength < ADPCM_HEADER_SIZE) {
    throw new Error("ADPCM packet is too small");
  }

  const view = new DataView(packet);
  if (view.getUint8(0) !== TYPE_AUDIO_IMA_ADPCM) {
    throw new Error("Not an IMA ADPCM packet");
  }
  if (view.getUint8(12) !== 1) {
    throw new Error(`Unsupported ADPCM version ${view.getUint8(12)}`);
  }

  const sampleCount = view.getUint16(7, false);
  const requiredBytes = Math.ceil(Math.max(0, sampleCount - 1) / 2);
  if (sampleCount === 0 || packet.byteLength < ADPCM_HEADER_SIZE + requiredBytes) {
    throw new Error("ADPCM payload is empty or truncated");
  }

  let predictor = view.getInt16(9, false);
  let stepIndex = clamp(view.getUint8(11), 0, 88);
  const samples = new Float32Array(sampleCount);
  samples[0] = predictor / 32768;

  for (let sampleIndex = 1; sampleIndex < sampleCount; sampleIndex += 1) {
    const encodedIndex = sampleIndex - 1;
    const packed = view.getUint8(ADPCM_HEADER_SIZE + Math.floor(encodedIndex / 2));
    const code = (encodedIndex & 1) === 0 ? packed & 0x0f : packed >> 4;
    const step = STEP_TABLE[stepIndex];

    let delta = step >> 3;
    if (code & 4) delta += step;
    if (code & 2) delta += step >> 1;
    if (code & 1) delta += step >> 2;

    predictor += (code & 8) ? -delta : delta;
    predictor = clamp(predictor, -32768, 32767);
    stepIndex = clamp(stepIndex + INDEX_TABLE[code], 0, 88);
    samples[sampleIndex] = predictor / 32768;
  }

  return samples;
}

function decodeLegacyPcmPacket(packet: ArrayBuffer): Float32Array {
  const view = new DataView(packet, 7);
  const samples = new Float32Array(Math.floor(view.byteLength / 2));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 32768;
  }
  return samples;
}

function createWebSocketUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/stream";
  url.search = "";
  url.hash = "";
  return url.toString();
}

interface DoorbellAvStreamOptions {
  apiUrl: string;
  deviceId: string;
  onVideoFrame: (jpeg: Blob) => void;
  onStatus?: (status: string) => void;
  onError?: (message: string) => void;
}

export class DoorbellAvStream {
  private readonly options: DoorbellAvStreamOptions;
  private socket: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private audioInput: GainNode | null = null;
  private audioFilters: AudioNode[] = [];
  private muted = false;
  private stopped = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs = 1000;
  private nextAudioStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();

  constructor(options: DoorbellAvStreamOptions) {
    this.options = options;
  }

  connect() {
    this.stopped = false;
    this.openSocket();
  }

  disconnect() {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
      source.disconnect();
    }
    this.activeSources.clear();
    this.nextAudioStartTime = 0;
    this.disconnectAudioGraph();
  }

  setAudioContext(audioContext: AudioContext | null) {
    if (this.audioContext === audioContext && this.audioInput) return;
    this.disconnectAudioGraph();
    this.audioContext = audioContext;
    this.nextAudioStartTime = 0;

    if (!audioContext) return;

    const input = audioContext.createGain();
    const highPass = audioContext.createBiquadFilter();
    const lowPass = audioContext.createBiquadFilter();
    const presence = audioContext.createBiquadFilter();
    const limiter = audioContext.createDynamicsCompressor();

    input.gain.value = 1.25;
    highPass.type = "highpass";
    highPass.frequency.value = 160;
    highPass.Q.value = 0.707;
    lowPass.type = "lowpass";
    lowPass.frequency.value = 4000;
    lowPass.Q.value = 0.707;
    presence.type = "peaking";
    presence.frequency.value = 2200;
    presence.Q.value = 0.8;
    presence.gain.value = 3;
    limiter.threshold.value = -5;
    limiter.knee.value = 2;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;

    input.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(presence);
    presence.connect(limiter);
    limiter.connect(audioContext.destination);

    this.audioInput = input;
    this.audioFilters = [input, highPass, lowPass, presence, limiter];
  }

  private disconnectAudioGraph() {
    for (const node of this.audioFilters) {
      try {
        node.disconnect();
      } catch {
        // The graph may already have been disconnected during teardown.
      }
    }
    this.audioFilters = [];
    this.audioInput = null;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.nextAudioStartTime = 0;
    }
  }

  private openSocket() {
    if (this.stopped) return;

    this.options.onStatus?.("Connecting to combined audio/video stream...");
    const socket = new WebSocket(createWebSocketUrl(this.options.apiUrl));
    socket.binaryType = "arraybuffer";
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectDelayMs = 1000;
      socket.send(JSON.stringify({
        type: "subscribe",
        device_id: this.options.deviceId,
      }));
    };

    socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        this.handleControlMessage(event.data);
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        this.handleMediaPacket(event.data);
      }
    };

    socket.onerror = () => {
      this.options.onError?.("Combined audio/video connection failed");
    };

    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      if (!this.stopped) this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.stopped) return;
    this.options.onStatus?.(`Stream disconnected; retrying in ${this.reconnectDelayMs / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 5000);
  }

  private handleControlMessage(rawMessage: string) {
    try {
      const message = JSON.parse(rawMessage);
      if (message.type === "subscribed") {
        this.options.onStatus?.("Connected · JPEG 5 FPS · IMA ADPCM 16 kHz mono");
      } else if (message.type === "error") {
        this.options.onError?.(message.message || "Stream server rejected the connection");
      }
    } catch {
      this.options.onError?.("Stream server sent an invalid control message");
    }
  }

  private handleMediaPacket(packet: ArrayBuffer) {
    if (packet.byteLength < 7) return;
    const type = new DataView(packet).getUint8(0);

    if (type === TYPE_CAMERA_JPEG) {
      this.options.onVideoFrame(new Blob([packet.slice(7)], { type: "image/jpeg" }));
      return;
    }

    if (type === TYPE_AUDIO_IMA_ADPCM) {
      this.scheduleAudio(decodeImaAdpcmPacket(packet));
    } else if (type === TYPE_AUDIO_PCM) {
      this.scheduleAudio(decodeLegacyPcmPacket(packet));
    }
  }

  private scheduleAudio(samples: Float32Array) {
    const context = this.audioContext;
    const audioInput = this.audioInput;
    if (this.muted || !context || !audioInput || context.state !== "running") return;

    const audioBuffer = context.createBuffer(1, samples.length, 16000);
    audioBuffer.getChannelData(0).set(samples);

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioInput);

    const now = context.currentTime;
    // A PCM block is 64 ms and JPEG messages share this WebSocket. Keep enough
    // audio queued to absorb a delayed JPEG send; the old 30 ms start reserve
    // caused repeated underruns that sounded like popping/static. After a genuine
    // underrun or suspended tab, rebuild a small clean buffer instead of
    // immediately starting another block into the same network jitter.
    if (
      this.nextAudioStartTime <= now ||
      this.nextAudioStartTime - now > AUDIO_MAX_BUFFER_SECONDS
    ) {
      this.nextAudioStartTime = now + AUDIO_START_BUFFER_SECONDS;
    }

    source.start(this.nextAudioStartTime);
    this.nextAudioStartTime += audioBuffer.duration;
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      source.disconnect();
    };
  }
}
