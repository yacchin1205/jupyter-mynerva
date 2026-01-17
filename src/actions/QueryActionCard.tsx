import * as React from 'react';
import { IQueryAction, ActionStatus } from './types';
import { DropdownButton } from './DropdownButton';

interface IQueryActionCardProps {
  action: IQueryAction;
  status: ActionStatus;
  onShare: () => void;
  onShareAlways: () => void;
  onDismiss: () => void;
}

function getActionLabel(action: IQueryAction): string {
  switch (action.type) {
    case 'getToc':
      return 'Get Table of Contents';
    case 'getSection':
      return `Get Section: ${JSON.stringify(action.query)}`;
    case 'getCells':
      return `Get Cells: ${JSON.stringify(action.query)}${action.count ? ` (count: ${action.count})` : ''}`;
    case 'getOutput':
      return `Get Output: ${JSON.stringify(action.query)}`;
    default:
      return 'Unknown Action';
  }
}

export function QueryActionCard({
  action,
  status,
  onShare,
  onShareAlways,
  onDismiss
}: IQueryActionCardProps): React.ReactElement {
  const label = getActionLabel(action);

  return (
    <div className="jp-Mynerva-action-card jp-Mynerva-query-action">
      <div className="jp-Mynerva-action-header">
        <span className="jp-Mynerva-action-icon">📋</span>
        <span className="jp-Mynerva-action-type">{action.type}</span>
      </div>
      <div className="jp-Mynerva-action-label">{label}</div>
      {status === 'pending' && (
        <div className="jp-Mynerva-action-buttons">
          <DropdownButton
            options={[
              { label: 'Share', onClick: onShare },
              { label: 'Share & Always', onClick: onShareAlways }
            ]}
          />
          <button
            className="jp-Mynerva-action-button jp-Mynerva-dismiss-button"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      )}
      {status === 'shared' && (
        <div className="jp-Mynerva-action-badge jp-Mynerva-shared-badge">
          Shared
        </div>
      )}
      {status === 'dismissed' && (
        <div className="jp-Mynerva-action-badge jp-Mynerva-dismissed-badge">
          Dismissed
        </div>
      )}
    </div>
  );
}
