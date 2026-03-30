export function preprocessMdx(src: string): string {
  return src
    .replace(/^(import|export)\s+.*/gm, '')
    .replace(/<([A-Z]\w*)(\s[^>]*)?\s*\/>/g, '`<$1/>`')
    .replace(/<([A-Z]\w*)(\s[^>]*)?>([\s\S]*?)<\/\1>/g, '`<$1>$3</$1>`')
}
