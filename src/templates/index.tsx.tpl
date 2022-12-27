import { BuildContext, prepareStyles } from 'dante'
import { renderToStaticMarkup } from 'react-dom/server'

export async function page(buildContext: BuildContext): Promise<string> {
  const contents = renderToStaticMarkup(<h1>Hello from Dante</h1>)

  return renderToStaticMarkup(
    <html>
      <head>
        <title>Hello!</title>
        <style
          data-dante-placeholder="style"
          dangerouslySetInnerHTML={{ __html: await prepareStyles(buildContext, contents) }}
        />
      </head>
      <body dangerouslySetInnerHTML={{ __html: contents }} />
    </html>
  )
}
