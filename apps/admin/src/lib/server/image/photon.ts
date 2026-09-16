import { PhotonImage, SamplingFilter, resize, watermark } from '@cf-wasm/photon';

export interface ProcessImageParams {
  data: ArrayBuffer;
  contentType: string;
  config: {
    auto_webp: boolean;
    max_width: number;
    quality: number;
  };
  watermark?: {
    enabled: boolean;
    image_key: string;
    position: string; // top-left / top-right / bottom-left / bottom-right / center
    opacity: number;
    scale: number;
  } | null;
  r2?: R2Bucket;
}

export interface ProcessImageResult {
  data: ArrayBuffer;
  contentType: string;
}

export async function processImage(params: ProcessImageParams): Promise<ProcessImageResult> {
  const { data, contentType, config } = params;
  if (!isPhotonSupported(contentType)) return { data, contentType };

  const wantWebp = config.auto_webp && contentType !== 'image/webp' && contentType !== 'image/gif';
  const wantWatermark = params.watermark?.enabled && !!params.r2;
  const wantResize = Number.isFinite(config.max_width) && config.max_width > 0;

  if (!wantWebp && !wantWatermark && !wantResize) return { data, contentType };

  let image: PhotonImage | null = null;
  let current: PhotonImage | null = null;

  try {
    image = PhotonImage.new_from_byteslice(new Uint8Array(data));
    current = image;

    const width = current.get_width();
    if (wantResize && width > config.max_width) {
      const ratio = config.max_width / width;
      const resized = resize(current, config.max_width, Math.round(current.get_height() * ratio), SamplingFilter.Lanczos3);
      if (current !== image) current.free();
      current = resized;
    }

    if (wantWatermark && params.r2) {
      const wmObj = await params.r2.get(params.watermark!.image_key);
      if (!wmObj) throw new Error('水印图片不存在');
      const wmData = await wmObj.arrayBuffer();
      const watermarkImage = PhotonImage.new_from_byteslice(new Uint8Array(wmData));
      let resizedWatermark: PhotonImage | null = null;
      let finalWatermark: PhotonImage | null = null;
      try {
        const scale = clamp(params.watermark!.scale, 0.01, 1);
        const wmWidth = Math.max(1, Math.round(current.get_width() * scale));
        const wmHeight = Math.max(1, Math.round((watermarkImage.get_height() / watermarkImage.get_width()) * wmWidth));
        resizedWatermark = resize(watermarkImage, wmWidth, wmHeight, SamplingFilter.Lanczos3);
        finalWatermark = withOpacity(resizedWatermark, clamp(params.watermark!.opacity, 0, 1));
        const { x, y } = calcPosition(params.watermark!.position, current.get_width(), current.get_height(), wmWidth, wmHeight);
        watermark(current, finalWatermark, BigInt(x), BigInt(y));
      } finally {
        finalWatermark?.free();
        resizedWatermark?.free();
        watermarkImage.free();
      }
    }

    const outputType = wantWebp ? 'image/webp' : contentType;
    const output = encodeImage(current, outputType, config.quality);
    return { data: toArrayBuffer(output), contentType: outputType === 'image/jpg' ? 'image/jpeg' : outputType };
  } finally {
    if (current && current !== image) current.free();
    image?.free();
  }
}

function isPhotonSupported(contentType: string) {
  return ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(contentType.toLowerCase());
}

function encodeImage(image: PhotonImage, contentType: string, quality: number): Uint8Array & { contentType?: string } {
  if (contentType === 'image/webp') return Object.assign(image.get_bytes_webp(), { contentType: 'image/webp' });
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    return Object.assign(image.get_bytes_jpeg(clamp(Math.round(quality), 1, 100)), { contentType: 'image/jpeg' });
  }
  return Object.assign(image.get_bytes(), { contentType: 'image/png' });
}

function withOpacity(image: PhotonImage, opacity: number): PhotonImage {
  if (opacity >= 0.995) return new PhotonImage(image.get_raw_pixels(), image.get_width(), image.get_height());
  const pixels = new Uint8Array(image.get_raw_pixels());
  for (let index = 3; index < pixels.length; index += 4) pixels[index] = Math.round(pixels[index] * opacity);
  return new PhotonImage(pixels, image.get_width(), image.get_height());
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function calcPosition(
  position: string,
  imgWidth: number,
  imgHeight: number,
  wmWidth: number,
  wmHeight: number,
  margin = 10
): { x: number; y: number } {
  switch (position) {
    case 'top-left':
      return { x: margin, y: margin };
    case 'top-right':
      return { x: imgWidth - wmWidth - margin, y: margin };
    case 'bottom-left':
      return { x: margin, y: imgHeight - wmHeight - margin };
    case 'bottom-right':
      return { x: imgWidth - wmWidth - margin, y: imgHeight - wmHeight - margin };
    case 'center':
      return {
        x: Math.round((imgWidth - wmWidth) / 2),
        y: Math.round((imgHeight - wmHeight) / 2)
      };
    default:
      return { x: margin, y: imgHeight - wmHeight - margin };
  }
}
