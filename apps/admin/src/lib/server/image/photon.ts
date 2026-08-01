// ============================================================================
// 图片处理（WebP 转换 + 水印）
// 使用 photon-rs WASM 库，在 Workers 环境中运行。
// 由于 photon WASM 加载的特殊性，这里做了 try-catch 容错：
// 如果 photon 不可用，回退为原图。
// ============================================================================

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

/**
 * 处理图片：可选 WebP 转换 + 水印。
 * photon-rs 的 WASM 模块需要动态加载。
 *
 * 实现说明：
 * - 在 Workers 环境中，photon-rs 通过 wasm-bindgen 绑定。
 * - 由于 Workers 对 WASM 的加载有限制，实际部署时可能需要用
 *   @cf-wasm/photon 等专门为 Workers 打包的版本。
 * - 这里实现接口和调用框架，具体 WASM 调用用 dynamic import。
 */
export async function processImage(params: ProcessImageParams): Promise<ProcessImageResult> {
  const { data, contentType, config } = params;

  // 如果不需要转换格式且不需要水印，直接返回
  const wantWebp = config.auto_webp && contentType !== 'image/webp' && contentType !== 'image/gif';
  const wantWatermark = params.watermark?.enabled && !!params.r2;

  if (!wantWebp && !wantWatermark) {
    return { data, contentType };
  }

  try {
    // 动态加载 photon WASM
    // 注意：实际部署时确保 photon 包被正确打包
    const photon = await importPhoton();

    if (!photon) {
      // photon 不可用，回退原图
      return { data, contentType };
    }

    // 用 photon 处理
    const image = photon.PhotonImage.new(new Uint8Array(data));
    const width = image.get_width();

    // 缩放（如果超过最大宽度）
    if (config.max_width && width > config.max_width) {
      const ratio = config.max_width / width;
      const newWidth = config.max_width;
      const newHeight = Math.round(image.get_height() * ratio);
      photon.resize.resize(
        image,
        newWidth,
        newHeight,
        photon.SamplingFilter.Lanczos3
      );
    }

    // 水印
    if (wantWatermark && params.r2) {
      const wmObj = await params.r2.get(params.watermark!.image_key);
      if (wmObj) {
        const wmData = await wmObj.arrayBuffer();
        const watermark = photon.PhotonImage.new(new Uint8Array(wmData));
        // 水印缩放
        const wmWidth = image.get_width() * params.watermark!.scale;
        const wmHeight = Math.round(
          (watermark.get_height() / watermark.get_width()) * wmWidth
        );
        photon.resize.resize(
          watermark,
          Math.round(wmWidth),
          wmHeight,
          photon.SamplingFilter.Lanczos3
        );
        // 计算位置
        const { x, y } = calcPosition(
          params.watermark!.position,
          image.get_width(),
          image.get_height(),
          Math.round(wmWidth),
          wmHeight
        );
        // 应用水印（photon-rs 的 watermark 函数）
        if (typeof photon.apply_watermark === 'function') {
          photon.apply_watermark(image, watermark, x, y, params.watermark!.opacity * 255);
        } else if (photon.multiple && typeof photon.multiple.apply_watermark === 'function') {
          photon.multiple.apply_watermark(image, watermark, x, y, params.watermark!.opacity * 255);
        }
      }
    }

    // 输出
    if (wantWebp) {
      const output = image.get_bytes_webp(config.quality);
      return {
        data: output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength),
        contentType: 'image/webp'
      };
    } else {
      const output = image.get_bytes();
      return {
        data: output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength),
        contentType
      };
    }
  } catch (e) {
    console.error('Photon 图片处理失败，使用原图:', e);
    return { data, contentType };
  }
}

/** 动态导入 photon WASM 模块
 * 使用变量名避免构建时静态分析报错。
 * photon-rs 包需要单独安装（见 docs/SETUP.md），未安装时返回 null，图片处理回退为原图。
 */
async function importPhoton(): Promise<any | null> {
  try {
    // 用变量构造模块名，防止 Vite/Rollup 静态分析时报 "模块不存在"
    const moduleName = 'photon-rs';
    // @ts-ignore - 运行时动态加载，构建时不解析
    const mod = await import(/* @vite-ignore */ moduleName);
    return mod;
  } catch {
    // photon 未安装或无法加载
    return null;
  }
}

/** 计算水印位置 */
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
