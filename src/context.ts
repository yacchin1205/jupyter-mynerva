import { INotebookTracker } from '@jupyterlab/notebook';
import { ICellModel, ICodeCellModel } from '@jupyterlab/cells';

/**
 * Query types for matching cells
 */
export interface IMatchQuery {
  match: string;
}

export interface IContainsQuery {
  contains: string;
}

export interface IStartQuery {
  start: number;
}

export interface IIdQuery {
  id: string;
}

export interface IActiveQuery {
  active: true;
}

export interface ISelectedQuery {
  selected: true;
}

export type ICellQuery =
  | IMatchQuery
  | IContainsQuery
  | IStartQuery
  | IIdQuery
  | IActiveQuery
  | ISelectedQuery;

/**
 * Table of contents entry
 */
export interface ITocEntry {
  level: number;
  text: string;
  cellIndex: number;
  cellId: string;
}

/**
 * Cell data for LLM (outputs excluded - use getOutput for outputs)
 */
export interface ICellData {
  index: number;
  id: string;
  type: 'code' | 'markdown' | 'raw';
  source: string;
  isActive: boolean;
  isSelected: boolean;
}

/**
 * Output data for LLM
 */
export interface IOutputData {
  outputType: string;
  text?: string;
  data?: Record<string, unknown>;
}

/**
 * Context Engine for extracting notebook structure
 */
export class ContextEngine {
  constructor(private notebookTracker: INotebookTracker) {}

  /**
   * Get the notebook widget - throws if no notebook is open
   */
  private getNotebookWidget() {
    const panel = this.notebookTracker.currentWidget;
    if (!panel) {
      throw new Error('No notebook is open');
    }
    return panel.content;
  }

  /**
   * Get the notebook model - throws if no notebook is open
   */
  private getNotebookModel() {
    const notebook = this.getNotebookWidget();
    const model = notebook.model;
    if (!model) {
      throw new Error('Notebook model is not available');
    }
    return model;
  }

  /**
   * Get active cell index (-1 if none)
   */
  private getActiveCellIndex(): number {
    return this.getNotebookWidget().activeCellIndex;
  }

  /**
   * Get set of selected cell indices
   */
  private getSelectedCellIndices(): Set<number> {
    const notebook = this.getNotebookWidget();
    const indices = new Set<number>();
    for (const cell of notebook.selectedCells) {
      const index = notebook.widgets.indexOf(cell);
      if (index >= 0) {
        indices.add(index);
      }
    }
    return indices;
  }

  /**
   * Get cell at index - throws if out of range
   */
  private getCellAt(index: number): ICellModel {
    const model = this.getNotebookModel();
    if (index < 0 || index >= model.cells.length) {
      throw new Error(`Cell index ${index} out of range (0-${model.cells.length - 1})`);
    }
    return model.cells.get(index);
  }

  /**
   * Extract outputs from a code cell model
   */
  private getCellOutputs(cell: ICellModel): IOutputData[] | undefined {
    if (cell.type !== 'code') {
      return undefined;
    }

    const codeCell = cell as ICodeCellModel;
    if (!codeCell.outputs || codeCell.outputs.length === 0) {
      return undefined;
    }

    const outputs: IOutputData[] = [];
    for (let i = 0; i < codeCell.outputs.length; i++) {
      const output = codeCell.outputs.get(i);
      const outputData: IOutputData = {
        outputType: output.type
      };

      if (output.type === 'stream') {
        outputData.text = (output as any).text;
      } else if (output.type === 'execute_result' || output.type === 'display_data') {
        outputData.data = (output as any).data;
        const textPlain = (output as any).data?.['text/plain'];
        if (textPlain) {
          outputData.text = textPlain;
        }
      } else if (output.type === 'error') {
        const errorOutput = output as any;
        outputData.text = `${errorOutput.ename}: ${errorOutput.evalue}`;
      }

      outputs.push(outputData);
    }

    return outputs.length > 0 ? outputs : undefined;
  }

  /**
   * Convert cell model to data for LLM
   */
  private cellToData(
    cell: ICellModel,
    index: number,
    activeCellIndex: number,
    selectedIndices: Set<number>
  ): ICellData {
    const type = cell.type;
    if (type !== 'code' && type !== 'markdown' && type !== 'raw') {
      throw new Error(`Unknown cell type: ${type}`);
    }
    return {
      index,
      id: cell.id,
      type,
      source: cell.sharedModel.source,
      isActive: index === activeCellIndex,
      isSelected: selectedIndices.has(index)
    };
  }

  /**
   * Parse heading from markdown cell source
   */
  private parseHeading(source: string): { level: number; text: string } | null {
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
   * Check if a cell matches the query
   */
  private matchesQuery(
    cell: ICellModel,
    index: number,
    query: ICellQuery,
    activeCellIndex: number,
    selectedIndices: Set<number>
  ): boolean {
    if ('start' in query) {
      return index === query.start;
    }
    if ('id' in query) {
      return cell.id === query.id;
    }
    if ('contains' in query) {
      return cell.sharedModel.source.includes(query.contains);
    }
    if ('match' in query) {
      return new RegExp(query.match).test(cell.sharedModel.source);
    }
    if ('active' in query) {
      return index === activeCellIndex;
    }
    if ('selected' in query) {
      return selectedIndices.has(index);
    }
    throw new Error(`Invalid query: ${JSON.stringify(query)}`);
  }

  /**
   * Find cell index matching the query - throws if not found
   */
  private findCellIndex(
    query: ICellQuery,
    activeCellIndex: number,
    selectedIndices: Set<number>
  ): number {
    const model = this.getNotebookModel();
    for (let i = 0; i < model.cells.length; i++) {
      if (this.matchesQuery(model.cells.get(i), i, query, activeCellIndex, selectedIndices)) {
        return i;
      }
    }
    throw new Error(`No cell matches query: ${JSON.stringify(query)}`);
  }

  /**
   * Get table of contents (heading structure)
   */
  getToc(): ITocEntry[] {
    const model = this.getNotebookModel();
    const toc: ITocEntry[] = [];

    for (let i = 0; i < model.cells.length; i++) {
      const cell = model.cells.get(i);
      if (cell.type !== 'markdown') {
        continue;
      }

      const heading = this.parseHeading(cell.sharedModel.source);
      if (heading) {
        toc.push({
          level: heading.level,
          text: heading.text,
          cellIndex: i,
          cellId: cell.id
        });
      }
    }

    return toc;
  }

  /**
   * Get cells under a matched heading (section)
   */
  getSection(query: ICellQuery): ICellData[] {
    const model = this.getNotebookModel();
    const activeCellIndex = this.getActiveCellIndex();
    const selectedIndices = this.getSelectedCellIndices();
    const startIndex = this.findCellIndex(query, activeCellIndex, selectedIndices);
    const startCell = model.cells.get(startIndex);

    const heading = this.parseHeading(startCell.sharedModel.source);
    if (!heading) {
      // Not a heading cell, return just this cell
      return [this.cellToData(startCell, startIndex, activeCellIndex, selectedIndices)];
    }

    const sectionCells: ICellData[] = [
      this.cellToData(startCell, startIndex, activeCellIndex, selectedIndices)
    ];

    for (let i = startIndex + 1; i < model.cells.length; i++) {
      const cell = model.cells.get(i);
      const cellHeading = this.parseHeading(cell.sharedModel.source);

      if (cellHeading && cellHeading.level <= heading.level) {
        break;
      }

      sectionCells.push(this.cellToData(cell, i, activeCellIndex, selectedIndices));
    }

    return sectionCells;
  }

  /**
   * Get cells from matched position
   */
  queryCells(query: ICellQuery, count?: number): ICellData[] {
    const model = this.getNotebookModel();
    const activeCellIndex = this.getActiveCellIndex();
    const selectedIndices = this.getSelectedCellIndices();
    const startIndex = this.findCellIndex(query, activeCellIndex, selectedIndices);
    const endIndex = count
      ? Math.min(startIndex + count, model.cells.length)
      : model.cells.length;

    const result: ICellData[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      result.push(this.cellToData(model.cells.get(i), i, activeCellIndex, selectedIndices));
    }

    return result;
  }

  /**
   * Get output of matched cell
   */
  getOutput(query: ICellQuery): IOutputData[] {
    const activeCellIndex = this.getActiveCellIndex();
    const selectedIndices = this.getSelectedCellIndices();
    const index = this.findCellIndex(query, activeCellIndex, selectedIndices);
    const cell = this.getCellAt(index);

    if (cell.type !== 'code') {
      throw new Error(`Cell at index ${index} is not a code cell (type: ${cell.type})`);
    }

    const outputs = this.getCellOutputs(cell);
    if (!outputs) {
      throw new Error(`Cell at index ${index} has no outputs`);
    }

    return outputs;
  }

  /**
   * Check if a notebook is currently open
   */
  hasActiveNotebook(): boolean {
    return this.notebookTracker.currentWidget !== null;
  }

  /**
   * Get the current notebook path
   */
  getNotebookPath(): string {
    const notebook = this.notebookTracker.currentWidget;
    if (!notebook) {
      throw new Error('No notebook is open');
    }
    const path = notebook.context?.path;
    if (!path) {
      throw new Error('Notebook path is not available');
    }
    return path;
  }
}
