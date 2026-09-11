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

export function resolveProductImage(value: unknown, fallback = 'shop-apple.png') {
  if (typeof value === 'string' && value) {
    const filename = value.split('/').pop() ?? ''
    if (filename in productImages) {
      return productImages[filename as keyof typeof productImages]
    }
    if (!value.includes('/src/assets/')) {
      return value
    }
  }

  return fallback in productImages
    ? productImages[fallback as keyof typeof productImages]
    : fallback
}
