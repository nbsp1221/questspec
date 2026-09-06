import { type Document, type LineCounter, type Node, isNode } from 'yaml';
import type { SourcePosition, SourceSpan } from '../diagnostics/diagnostic.ts';

export class YamlSourceMap {
  private readonly document: Document;
  private readonly lineCounter: LineCounter;

  constructor(document: Document, lineCounter: LineCounter) {
    this.document = document;
    this.lineCounter = lineCounter;
  }

  spanForOffsets(start: number, end = start): SourceSpan {
    return { end: this.position(end), start: this.position(start) };
  }

  spanForPath(path: Array<number | string>): SourceSpan | undefined {
    const candidate = path.length === 0 ? this.document.contents : this.document.getIn(path, true);
    if (!isNode(candidate)) {
      return undefined;
    }
    return this.spanForNode(candidate);
  }

  private position(offset: number): SourcePosition {
    const position = this.lineCounter.linePos(offset);
    return { column: position.col, line: position.line, offset };
  }

  private spanForNode(node: Node): SourceSpan | undefined {
    if (!node.range) {
      return undefined;
    }
    return this.spanForOffsets(node.range[0], node.range[1]);
  }
}
