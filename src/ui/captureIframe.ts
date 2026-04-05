import html2canvas from 'html2canvas-pro'
import { COMPONENT_ROOT_ID } from '../shared/constants'

/**
 * Capture the rendered component inside a same-origin iframe as ImageData.
 *
 * Targets the component's wrapper element rather than the full iframe body,
 * so the capture is cropped to the component's actual bounding box.
 */
export async function captureIframe(
  iframe: HTMLIFrameElement,
): Promise<ImageData> {
  const doc = iframe.contentDocument
  if (!doc) throw new Error('Cannot access iframe document (cross-origin?)')

  const target = doc.getElementById(COMPONENT_ROOT_ID) ?? doc.body

  const canvas = await html2canvas(target, {
    logging: false,
  })

  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}
