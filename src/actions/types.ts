import { ICellQuery } from '../context';

/**
 * LLM response structure
 */
export interface ILLMResponse {
  messages: Array<{ role: 'assistant'; content: string }>;
  actions: IAction[];
}

/**
 * Query action types (read-only, displayed on user side)
 */
export type IQueryAction =
  | IGetTocAction
  | IGetSectionAction
  | IGetCellsAction
  | IGetOutputAction;

/**
 * Mutate action types (modify notebook, displayed on assistant side)
 */
export type IMutateAction =
  | IInsertCellAction
  | IUpdateCellAction
  | IDeleteCellAction
  | IRunCellAction;

/**
 * Help action types
 */
export type IHelpAction = IListHelpAction | IHelpDetailAction;

/**
 * All action types
 */
export type IAction = IQueryAction | IMutateAction | IHelpAction;

export interface IGetTocAction {
  type: 'getToc';
}

export interface IGetSectionAction {
  type: 'getSection';
  query: ICellQuery;
}

export interface IGetCellsAction {
  type: 'getCells';
  query: ICellQuery;
  count?: number;
}

export interface IGetOutputAction {
  type: 'getOutput';
  query: ICellQuery;
}

export interface IListHelpAction {
  type: 'listHelp';
}

export interface IHelpDetailAction {
  type: 'help';
  action: string;
}

/**
 * Mutate action interfaces
 */
export interface IInsertCellAction {
  type: 'insertCell';
  position: ICellQuery | 'end';
  cellType: 'code' | 'markdown';
  source: string;
}

export interface IUpdateCellAction {
  type: 'updateCell';
  query: ICellQuery;
  source: string;
}

export interface IDeleteCellAction {
  type: 'deleteCell';
  query: ICellQuery;
}

export interface IRunCellAction {
  type: 'runCell';
  query: ICellQuery;
}

/**
 * Action status for UI
 * Query: pending → shared | dismissed
 * Mutate: pending → applied | cancelled
 */
export type ActionStatus = 'pending' | 'shared' | 'dismissed' | 'applied' | 'cancelled';

/**
 * Action with status for tracking
 */
export interface IActionWithStatus {
  action: IAction;
  status: ActionStatus;
}
