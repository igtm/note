import { Editor, Extension } from '@tiptap/core'
import type { JSONContent } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import { createEffect, onCleanup, onMount } from 'solid-js'
import { findDeferredLinkRanges } from './links'
import { contentSignature } from './notebook'

const ListIndentExtension = Extension.create({
  name: 'listIndent',

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (editor.isActive('taskItem')) return false
        if (!editor.isActive('listItem')) return false
        return editor.commands.sinkListItem('listItem')
      },
      'Shift-Tab': ({ editor }) => {
        if (editor.isActive('taskItem')) return false
        if (!editor.isActive('listItem')) return false
        return editor.commands.liftListItem('listItem')
      },
    }
  },
})

const applyDeferredLinksInCurrentBlock = (editor: Editor) => {
  const { state, view } = editor
  const linkMark = state.schema.marks.link
  if (!linkMark) return

  const parent = state.selection.$from.parent
  if (!parent.isTextblock) return

  const text = parent.textBetween(0, parent.content.size, ' ')
  const matches = findDeferredLinkRanges(text)
  if (!matches.length) return

  const blockStart = state.selection.$from.start()
  let transaction = state.tr
  let changed = false

  matches.forEach((match) => {
    const from = blockStart + match.from
    const to = blockStart + match.to
    transaction = transaction.removeMark(from, to, linkMark)
    transaction = transaction.addMark(
      from,
      to,
      linkMark.create({
        href: match.href,
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
      }),
    )
    changed = true
  })

  if (changed) view.dispatch(transaction)
}

const DeferredLinkExtension = Extension.create({
  name: 'deferredLink',

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        applyDeferredLinksInCurrentBlock(editor)
        return false
      },
    }
  },
})

type RichTextItemProps = {
  content: JSONContent
  editable: boolean
  placeholder: string
  onBlur: () => void
  onContentChange: (content: JSONContent) => void
  onLayoutChange: () => void
}

export const RichTextItem = (props: RichTextItemProps) => {
  let element!: HTMLDivElement
  let editor: Editor | undefined
  let resizeObserver: ResizeObserver | undefined
  let frame = 0
  let lastSignature = contentSignature(props.content)
  let lastEditable = props.editable

  const scheduleLayout = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => props.onLayoutChange())
  }

  onMount(() => {
    editor = new Editor({
      element,
      autofocus: props.editable ? 'end' : false,
      editable: props.editable,
      content: props.content,
      extensions: [
        StarterKit.configure({
          blockquote: false,
          bold: false,
          code: false,
          codeBlock: false,
          dropcursor: false,
          gapcursor: false,
          heading: false,
          horizontalRule: false,
          italic: false,
          strike: false,
          underline: false,
          trailingNode: false,
        }),
        Link.configure({
          autolink: false,
          linkOnPaste: false,
          openOnClick: false,
          HTMLAttributes: {
            rel: 'noopener noreferrer nofollow',
            target: '_blank',
          },
        }),
        TaskList,
        TaskItem.configure({
          nested: true,
          onReadOnlyChecked: () => false,
        }),
        Placeholder.configure({
          placeholder: props.placeholder,
          showOnlyWhenEditable: false,
        }),
        ListIndentExtension,
        DeferredLinkExtension,
      ],
      editorProps: {
        attributes: {
          class: 'item-editor-surface',
          'aria-label': 'Note editor',
        },
      },
      onCreate: scheduleLayout,
      onFocus: scheduleLayout,
      onBlur: () => {
        props.onBlur()
        scheduleLayout()
      },
      onSelectionUpdate: scheduleLayout,
      onUpdate: ({ editor: instance }) => {
        const nextContent = instance.getJSON()
        lastSignature = contentSignature(nextContent)
        props.onContentChange(nextContent)
        scheduleLayout()
      },
    })

    resizeObserver = new ResizeObserver(() => scheduleLayout())
    resizeObserver.observe(element)
    scheduleLayout()
  })

  createEffect(() => {
    if (!editor) return

    const nextSignature = contentSignature(props.content)
    if (nextSignature === lastSignature) return

    lastSignature = nextSignature
    editor.commands.setContent(props.content, { emitUpdate: false })
    scheduleLayout()
  })

  createEffect(() => {
    if (!editor) return

    editor.setEditable(props.editable, false)

    if (props.editable && !lastEditable) {
      queueMicrotask(() => {
        editor?.commands.focus('end', { scrollIntoView: false })
      })
    }

    if (!props.editable && lastEditable) {
      editor.commands.blur()
    }

    lastEditable = props.editable
    scheduleLayout()
  })

  onCleanup(() => {
    cancelAnimationFrame(frame)
    resizeObserver?.disconnect()
    editor?.destroy()
  })

  return (
    <div
      ref={element}
      class="item-editor"
      onPointerDown={(event) => {
        if (props.editable) {
          event.stopPropagation()
          return
        }

        if (!(event.target instanceof Element)) return
        if (event.target.closest('a')) event.stopPropagation()
      }}
      onClick={(event) => {
        if (props.editable || !(event.target instanceof Element)) return
        const anchor = event.target.closest('a')
        if (!(anchor instanceof HTMLAnchorElement) || !anchor.href) return
        event.preventDefault()
        event.stopPropagation()
        window.open(anchor.href, '_blank', 'noopener,noreferrer')
      }}
    />
  )
}
