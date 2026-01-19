import { ContentsManager, Contents } from '@jupyterlab/services';
import {
  ICellQuery,
  ITocEntry,
  ICellData,
  IOutputData,
  computeCellHash
} from './context';

/**
 * Notebook JSON structure from Contents API
 */
interface INotebookCell {
  cell_type: 'code' | 'markdown' | 'raw';
  source: string | string[];
  id?: string;
  outputs?: INotebookOutput[];
}

interface INotebookOutput {
  output_type: string;
  text?: string | string[];
  data?: Record<string, unknown>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
}

interface INotebookContent {
  cells: INotebookCell[];
}

/**
 * Normalize cell source (can be string or array of strings)
 */
function normalizeSource(source: string | string[]): string {
  return Array.isArray(source) ? source.join('') : source;
}

/**
 * Parse heading from markdown cell source
 */
function parseHeading(source: string): { level: number; text: string } | null {
  const match = source.match(/^(#{1,6})\s+(.+)$/m);
  if (!match) {
    return null;
  }
  return {
    level: match[1].length,
    text: match[2].trim()
  };
}

/**
 * Convert notebook cell to ICellData
 */
function cellToData(cell: INotebookCell, index: number): ICellData {
  const type = cell.cell_type;
  const source = normalizeSource(cell.source);
  return {
    index,
    id: cell.id || `cell-${index}`,
    type,
    source,
    isActive: false,
    isSelected: false,
    _hash: computeCellHash(type, source)
  };
}

/**
 * Extract outputs from notebook cell
 */
function extractOutputs(cell: INotebookCell): IOutputData[] | undefined {
  if (cell.cell_type !== 'code' || !cell.outputs || cell.outputs.length === 0) {
    return undefined;
  }

  const outputs: IOutputData[] = [];
  for (const output of cell.outputs) {
    const outputData: IOutputData = {
      outputType: output.output_type
    };

    if (output.output_type === 'stream') {
      const text = output.text;
      outputData.text = Array.isArray(text) ? text.join('') : text;
    } else if (
      output.output_type === 'execute_result' ||
      output.output_type === 'display_data'
    ) {
      outputData.data = output.data;
      const textPlain = output.data?.['text/plain'];
      if (textPlain) {
        outputData.text = Array.isArray(textPlain)
          ? textPlain.join('')
          : String(textPlain);
      }
    } else if (output.output_type === 'error') {
      const lines = [`${output.ename}: ${output.evalue}`];
      if (output.traceback) {
        lines.push(...output.traceback);
      }
      outputData.text = lines.join('\n');
    }

    outputs.push(outputData);
  }

  return outputs.length > 0 ? outputs : undefined;
}

/**
 * Check if a cell matches the query (file version - no active/selected support)
 */
function matchesQuery(
  cell: INotebookCell,
  index: number,
  query: ICellQuery
): boolean {
  if ('start' in query) {
    return index === query.start;
  }
  if ('id' in query) {
    return (cell.id || `cell-${index}`) === query.id;
  }
  const source = normalizeSource(cell.source);
  if ('contains' in query) {
    return source.includes(query.contains);
  }
  if ('match' in query) {
    return new RegExp(query.match).test(source);
  }
  if ('active' in query || 'selected' in query) {
    throw new Error('active/selected queries not supported for file access');
  }
  throw new Error(`Invalid query: ${JSON.stringify(query)}`);
}

/**
 * Find cell index matching the query
 */
function findCellIndex(cells: INotebookCell[], query: ICellQuery): number {
  for (let i = 0; i < cells.length; i++) {
    if (matchesQuery(cells[i], i, query)) {
      return i;
    }
  }
  throw new Error(`No cell matches query: ${JSON.stringify(query)}`);
}

/**
 * NotebookFileReader - reads and parses notebook files via Contents API
 */
export class NotebookFileReader {
  private contents: ContentsManager;

  constructor() {
    this.contents = new ContentsManager();
  }

  /**
   * List notebook files in a directory
   */
  async listNotebooks(path: string = ''): Promise<string[]> {
    const model = await this.contents.get(path);
    if (model.type !== 'directory') {
      throw new Error(`Path is not a directory: ${path}`);
    }
    const content = model.content as Contents.IModel[];
    return content
      .filter(item => item.type === 'notebook')
      .map(item => item.path);
  }

  /**
   * Get notebook content
   */
  private async getNotebook(path: string): Promise<INotebookContent> {
    if (!path.endsWith('.ipynb')) {
      throw new Error('Only .ipynb files are supported');
    }
    const model = await this.contents.get(path, { content: true });
    if (model.type !== 'notebook') {
      throw new Error(`Path is not a notebook: ${path}`);
    }
    return model.content as INotebookContent;
  }

  /**
   * Get table of contents from file
   */
  async getToc(path: string): Promise<ITocEntry[]> {
    const notebook = await this.getNotebook(path);
    const toc: ITocEntry[] = [];

    for (let i = 0; i < notebook.cells.length; i++) {
      const cell = notebook.cells[i];
      if (cell.cell_type !== 'markdown') {
        continue;
      }

      const heading = parseHeading(normalizeSource(cell.source));
      if (heading) {
        toc.push({
          level: heading.level,
          text: heading.text,
          cellIndex: i,
          cellId: cell.id || `cell-${i}`
        });
      }
    }

    return toc;
  }

  /**
   * Get section from file
   */
  async getSection(path: string, query: ICellQuery): Promise<ICellData[]> {
    const notebook = await this.getNotebook(path);
    const startIndex = findCellIndex(notebook.cells, query);
    const startCell = notebook.cells[startIndex];

    const heading = parseHeading(normalizeSource(startCell.source));
    if (!heading) {
      return [cellToData(startCell, startIndex)];
    }

    const sectionCells: ICellData[] = [cellToData(startCell, startIndex)];

    for (let i = startIndex + 1; i < notebook.cells.length; i++) {
      const cell = notebook.cells[i];
      const cellHeading = parseHeading(normalizeSource(cell.source));

      if (cellHeading && cellHeading.level <= heading.level) {
        break;
      }

      sectionCells.push(cellToData(cell, i));
    }

    return sectionCells;
  }

  /**
   * Get cells from file
   */
  async getCells(
    path: string,
    query: ICellQuery,
    count?: number
  ): Promise<ICellData[]> {
    const notebook = await this.getNotebook(path);
    const startIndex = findCellIndex(notebook.cells, query);
    const endIndex = count
      ? Math.min(startIndex + count, notebook.cells.length)
      : notebook.cells.length;

    const result: ICellData[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      result.push(cellToData(notebook.cells[i], i));
    }

    return result;
  }

  /**
   * Get output from file
   */
  async getOutput(path: string, query: ICellQuery): Promise<IOutputData[]> {
    const notebook = await this.getNotebook(path);
    const index = findCellIndex(notebook.cells, query);
    const cell = notebook.cells[index];

    if (cell.cell_type !== 'code') {
      throw new Error(
        `Cell at index ${index} is not a code cell (type: ${cell.cell_type})`
      );
    }

    const outputs = extractOutputs(cell);
    if (!outputs) {
      throw new Error(`Cell at index ${index} has no outputs`);
    }

    return outputs;
  }
}
