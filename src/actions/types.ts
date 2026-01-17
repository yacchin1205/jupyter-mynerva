import { ICellQuery } from '../context';

/**
 * LLM response structure
 */
export interface ILLMResponse {
  messages: Array<{ role: 'assistant'; content: string }>;
  actions: IAction[];
}

/**
 * Query action types
 */
export type IQueryAction =
  | IGetTocAction
  | IGetSectionAction
  | IGetCellsAction
  | IGetOutputAction;

/**
 * Help action types
 */
export type IHelpAction = IListHelpAction | IHelpDetailAction;

/**
 * All action types
 */
export type IAction = IQueryAction | IHelpAction;

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
 * Action status for UI
 */
export type ActionStatus = 'pending' | 'shared' | 'dismissed';

/**
 * Action with status for tracking
 */
export interface IActionWithStatus {
  action: IAction;
  status: ActionStatus;
}
