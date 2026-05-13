import { useMemo } from "react";

/**
 * 轻量级 Markdown 渲染组件
 * 支持：代码块、行内代码、粗体、斜体、标题、列表、链接、分割线
 * 不依赖外部 markdown 库，保持 bundle 体积小
 */
export function MarkdownContent({ content }: { content: string }) {
  const rendered = useMemo(() => renderMarkdown(content), [content]);
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none break-words
        prose-p:my-1.5 prose-pre:my-2 prose-ul:my-1.5 prose-ol:my-1.5
        prose-headings:my-2 prose-li:my-0.5
        prose-code:before:content-none prose-code:after:content-none
        prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em]
        prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-lg prose-pre:p-3
        prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}

function renderMarkdown(md: string): string {
  // 先处理代码块（防止内部内容被其他规则处理）
  const codeBlocks: string[] = [];
  let processed = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const escaped = escapeHtml(code.trimEnd());
    codeBlocks.push(
      `<pre><code class="language-${lang || "text"}">${escaped}</code></pre>`
    );
    return `\x00CODEBLOCK${idx}\x00`;
  });

  // 行内代码
  processed = processed.replace(/`([^`]+)`/g, (_, code) => {
    return `<code>${escapeHtml(code)}</code>`;
  });

  // 按行处理
  const lines = processed.split("\n");
  const result: string[] = [];
  let inList = false;
  let listType = "";

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // 代码块占位符
    const codeMatch = line.match(/^\x00CODEBLOCK(\d+)\x00$/);
    if (codeMatch) {
      if (inList) { result.push(listType === "ul" ? "</ul>" : "</ol>"); inList = false; }
      result.push(codeBlocks[parseInt(codeMatch[1])]);
      continue;
    }

    // 标题
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (inList) { result.push(listType === "ul" ? "</ul>" : "</ol>"); inList = false; }
      const level = headingMatch[1].length;
      result.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      continue;
    }

    // 分割线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      if (inList) { result.push(listType === "ul" ? "</ul>" : "</ol>"); inList = false; }
      result.push("<hr />");
      continue;
    }

    // 无序列表
    const ulMatch = line.match(/^[\s]*[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== "ul") {
        if (inList) result.push(listType === "ul" ? "</ul>" : "</ol>");
        result.push("<ul>");
        inList = true;
        listType = "ul";
      }
      result.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    // 有序列表
    const olMatch = line.match(/^[\s]*\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== "ol") {
        if (inList) result.push(listType === "ul" ? "</ul>" : "</ol>");
        result.push("<ol>");
        inList = true;
        listType = "ol";
      }
      result.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    // 非列表行，关闭列表
    if (inList) {
      result.push(listType === "ul" ? "</ul>" : "</ol>");
      inList = false;
    }

    // 空行
    if (line.trim() === "") {
      result.push("");
      continue;
    }

    // 普通段落
    result.push(`<p>${inlineFormat(line)}</p>`);
  }

  if (inList) result.push(listType === "ul" ? "</ul>" : "</ol>");

  return result.join("\n");
}

function inlineFormat(text: string): string {
  // 粗体
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");
  // 斜体
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
  text = text.replace(/_(.+?)_/g, "<em>$1</em>");
  // 链接
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return text;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
