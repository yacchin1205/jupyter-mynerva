import * as React from 'react';
import { IMutateAction, ActionStatus } from './types';

interface IMutateActionCardProps {
  action: IMutateAction;
  status: ActionStatus;
  onApply: () => void;
  onCancel: () => void;
}

function getActionLabel(action: IMutateAction): string {
  switch (action.type) {
    case 'insertCell':
      return `Insert ${action.cellType} cell`;
    case 'updateCell':
      return `Update cell: ${JSON.stringify(action.query)}`;
    case 'deleteCell':
      return `Delete cell: ${JSON.stringify(action.query)}`;
    case 'runCell':
      return `Run cell: ${JSON.stringify(action.query)}`;
    default:
      return 'Unknown Action';
  }
}

function getPreviewContent(action: IMutateAction): string | null {
  switch (action.type) {
    case 'insertCell':
    case 'updateCell':
      return action.source;
    default:
      return null;
  }
}

export function MutateActionCard({
  action,
  status,
  onApply,
  onCancel
}: IMutateActionCardProps): React.ReactElement {
  const [showPreview, setShowPreview] = React.useState(false);
  const label = getActionLabel(action);
  const previewContent = getPreviewContent(action);

  return (
    <div className="jp-Mynerva-action-card jp-Mynerva-mutate-action">
      <div className="jp-Mynerva-action-header">
        <span className="jp-Mynerva-action-icon">✏️</span>
        <span className="jp-Mynerva-action-type">{action.type}</span>
      </div>
      <div className="jp-Mynerva-action-label">{label}</div>
      {status === 'pending' && (
        <>
          {previewContent && (
            <button
              className="jp-Mynerva-action-button jp-Mynerva-preview-toggle"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? 'Hide Preview' : 'Show Preview'}
            </button>
          )}
          {showPreview && previewContent && (
            <pre className="jp-Mynerva-action-preview">{previewContent}</pre>
          )}
          <div className="jp-Mynerva-action-buttons">
            <button
              className="jp-Mynerva-action-button jp-Mynerva-apply-button"
              onClick={onApply}
            >
              Apply
            </button>
            <button
              className="jp-Mynerva-action-button jp-Mynerva-cancel-button"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </>
      )}
      {status === 'applied' && (
        <div className="jp-Mynerva-action-badge jp-Mynerva-applied-badge">Applied</div>
      )}
      {status === 'cancelled' && (
        <div className="jp-Mynerva-action-badge jp-Mynerva-cancelled-badge">Cancelled</div>
      )}
    </div>
  );
}
