import apple from '../assets/shop-apple.png'
import banana from '../assets/shop-banana.png'
import pepper from '../assets/shop-pepper.png'
import cabbage from '../assets/shop-cabbage.png'
import carrot from '../assets/shop-carrot.png'
import corn from '../assets/shop-corn.png'
import cucumber from '../assets/shop-cucumber.png'
import guava from '../assets/shop-guava.png'
import gumamela from '../assets/shop-gumamela.png'

export const productImages = {
  'shop-apple.png': apple,
  'shop-banana.png': banana,
  'shop-pepper.png': pepper,
  'shop-cabbage.png': cabbage,
  'shop-carrot.png': carrot,
  'shop-corn.png': corn,
  'shop-cucumber.png': cucumber,
  'shop-guava.png': guava,
  'shop-gumamela.png': gumamela,
} as const

export function productImageKey(value: string) {
  return (Object.entries(productImages).find(([, image]) => image === value)?.[0] ?? value)
}

export function resolveProductImage(value: unknown, fallback = 'shop-apple.png') {
  if (typeof value === 'string' && value) {
    if (
      value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('blob:') ||
      value.startsWith('data:')
    ) {
      return value
    }

    const filename = value.split('/').pop() ?? ''
    const imageKey = Object.keys(productImages).find((key) => filename === key || filename.startsWith(`${key.replace('.png', '-')}`))
    const isLocalPath = value === filename || value.includes('/src/assets/') || value.startsWith('src/assets/') || value.startsWith('/assets/')
    if (isLocalPath && imageKey) {
      return productImages[imageKey as keyof typeof productImages]
    }
    if (!isLocalPath) {
      return value
    }
  }

  return fallback in productImages
    ? productImages[fallback as keyof typeof productImages]
    : fallback
}
