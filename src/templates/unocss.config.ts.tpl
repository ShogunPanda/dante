import presetWind from '@unocss/preset-wind'
import transformerDirectives from '@unocss/transformer-directives'

export const cssConfig = {
  presets: [presetWind()],
  transformers: [transformerDirectives()]
}
