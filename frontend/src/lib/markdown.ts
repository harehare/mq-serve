import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkFrontmatter from 'remark-frontmatter'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import rehypeShikiFromHighlighter from '@shikijs/rehype/core'
import { createHighlighter } from 'shiki'
import { visit } from 'unist-util-visit'
import { parse as parseYaml } from 'yaml'
import type { Root as MdastRoot } from 'mdast'
import type { Root as HastRoot, Element } from 'hast'
import 'katex/dist/katex.min.css'

export interface Heading {
  id: string
  text: string
  level: number
}

export interface ParseResult {
  html: string
  frontmatter: Record<string, unknown> | null
  headings: Heading[]
}

function getTextContent(node: Element | HastRoot | { type: string; value?: string; children?: unknown[] }): string {
  if ('value' in node && typeof node.value === 'string') return node.value
  if ('children' in node && Array.isArray(node.children)) {
    return node.children.map((c) => getTextContent(c as Element)).join('')
  }
  return ''
}

function remarkExtractFrontmatter() {
  return (tree: MdastRoot, file: { data: Record<string, unknown> }) => {
    visit(tree, 'yaml', (node: { value: string }) => {
      try {
        file.data['frontmatter'] = parseYaml(node.value) as Record<string, unknown>
      } catch {
        file.data['frontmatter'] = null
      }
    })
  }
}

function rehypeMermaid() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (
        node.tagName === 'pre' &&
        node.children?.[0] &&
        (node.children[0] as Element).tagName === 'code'
      ) {
        const code = node.children[0] as Element
        const classes = (code.properties?.className as string[]) || []
        if (classes.includes('language-mermaid')) {
          const content = getTextContent(code)
          if (parent && index != null) {
            parent.children[index] = {
              type: 'element',
              tagName: 'div',
              properties: { className: ['mermaid'], 'data-mermaid': content },
              children: [{ type: 'text', value: content }],
            } as Element
          }
        }
      }
    })
  }
}

function rehypeExtractHeadings() {
  return (tree: HastRoot, file: { data: Record<string, unknown> }) => {
    const headings: Heading[] = []
    visit(tree, 'element', (node: Element) => {
      if (/^h[1-6]$/.test(node.tagName)) {
        const level = parseInt(node.tagName[1])
        const id = (node.properties?.id as string) || ''
        const text = getTextContent(node)
        if (id && text) headings.push({ id, text, level })
      }
    })
    file.data['headings'] = headings
  }
}

// Shared highlighter instance reused by both the unified processor and raw code view.
// Resolves once themes and the common language grammars are ready.
let highlighterPromise: ReturnType<typeof createHighlighter> | null = null

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [
        'markdown', 'javascript', 'typescript', 'jsx', 'tsx',
        'json', 'rust', 'python', 'go', 'java', 'c', 'cpp',
        'bash', 'shell', 'yaml', 'toml', 'html', 'css', 'sql',
        'ruby', 'php', 'swift', 'kotlin', 'diff', 'xml',
      ],
    })
  }
  return highlighterPromise
}

// Dynamically load a language into the highlighter if not already loaded.
async function ensureLang(lang: string): Promise<boolean> {
  try {
    const highlighter = await getHighlighter()
    const loaded = highlighter.getLoadedLanguages()
    if (!loaded.includes(lang as never)) {
      await highlighter.loadLanguage(lang as never)
    }
    return true
  } catch {
    return false
  }
}

// Processor promise resolves only after the highlighter is ready so the
// first real document render never has to wait for Shiki initialization.
let processorPromise: Promise<ReturnType<typeof unified>> | null = null

function getProcessor(): Promise<ReturnType<typeof unified>> {
  if (!processorPromise) {
    processorPromise = getHighlighter().then((highlighter) => {
      return unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkMath)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkExtractFrontmatter)
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeMermaid)
        .use(rehypeShikiFromHighlighter, highlighter, {
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        })
        .use(rehypeKatex)
        .use(rehypeSlug)
        .use(rehypeExtractHeadings)
        .use(rehypeStringify, { allowDangerousHtml: true })
    })
  }
  return processorPromise!
}

// Kick off highlighter + processor initialization immediately at module load time
getProcessor()

export async function highlightMarkdown(code: string): Promise<string> {
  const highlighter = await getHighlighter()
  return highlighter.codeToHtml(code, {
    lang: 'markdown',
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
  })
}

export async function renderMarkdown(content: string): Promise<ParseResult> {
  // Pre-load any languages referenced in fenced code blocks before rendering.
  const fencedLangRe = /^```(\w[-\w]*)/gm
  const langs = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = fencedLangRe.exec(content)) !== null) {
    langs.add(m[1].toLowerCase())
  }
  await Promise.all([...langs].map(ensureLang))

  const processor = await getProcessor()
  const file = await processor.process(content)
  const data = file.data as Record<string, unknown>

  return {
    html: String(file),
    frontmatter: (data['frontmatter'] as Record<string, unknown> | null) ?? null,
    headings: (data['headings'] as Heading[]) ?? [],
  }
}
