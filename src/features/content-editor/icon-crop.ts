export interface IconCrop {
  x: number
  y: number
  width: number
  height: number
}
/**
 * 建议仅是中心方形范围，管理员必须核对并确认实际图标语义。
 * @param width - 原图或裁切宽度
 * @param height - 原图或裁切高度
 * @returns 供管理员核对的裁切范围
 */
export function suggestCrop(width: number, height: number): IconCrop {
  const size = Math.min(width, height)
  return {
    x: Math.floor((width - size) / 2),
    y: Math.floor((height - size) / 2),
    width: size,
    height: size
  }
}
/**
 * 阻止无效坐标产生空图或越界图。
 * @param crop - 人工调整的像素范围
 * @param width - 原图或裁切宽度
 * @param height - 原图或裁切高度
 * @returns 范围是否有效
 */
export function validateCrop(crop: IconCrop, width: number, height: number): boolean {
  return (
    Object.values(crop).every(Number.isInteger) &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= width &&
    crop.y + crop.height <= height
  )
}
/**
 * 只生成本地预览，上传须由管理员另行确认。
 * @param url - 已签名素材地址
 * @param crop - 人工调整的像素范围
 * @returns 尚未上传的本地图标文件
 */
export async function previewCrop(url: string, crop: IconCrop): Promise<File> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = url
  await image.decode()
  if (!validateCrop(crop, image.naturalWidth, image.naturalHeight))
    throw new Error('裁切范围须位于原图内')
  const canvas = document.createElement('canvas')
  canvas.width = crop.width
  canvas.height = crop.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器不支持图标裁切')
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('裁切预览失败'))),
      'image/png'
    )
  )
  return new File([blob], 'lexicon-icon.png', { type: 'image/png' })
}
