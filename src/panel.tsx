import { ILabShell } from '@jupyterlab/application';
import { ServerConnection } from '@jupyterlab/services';
import {
  ReactWidget,
  consoleIcon,
  settingsIcon
} from '@jupyterlab/ui-components';
import * as React from 'react';

import { ContextEngine } from './context';
import {
  IAction,
  IQueryAction,
  IMutateAction,
  ActionStatus,
  parseRawContent,
  validateActions,
  QueryActionCard,
  MutateActionCard
} from './actions';
import { buildSystemPrompt } from './systemPrompt';
import { IFilter, applyFilters } from './filter';

const PANEL_CLASS = 'jp-Mynerva-panel';

interface IMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  actions?: IAction[];
  generated?: boolean; // Auto-generated messages (show brief in UI)
}

interface IConfig {
  provider: string;
  model: string;
  apiKey: string;
  useDefault?: boolean;
}

interface IDefaultConfig {
  provider: string;
  model: string;
}

interface IProvider {
  id: string;
  displayName: string;
  models: string[];
}

interface IProvidersResponse {
  providers: IProvider[];
  encryption: boolean;
  defaults: IDefaultConfig | null;
  filters: IFilter[];
}

async function getProviders(): Promise<IProvidersResponse> {
  const settings = ServerConnection.makeSettings();
  const url = `${settings.baseUrl}jupyter-mynerva/providers`;
  const response = await ServerConnection.makeRequest(url, {}, settings);

  if (!response.ok) {
    console.error(
      'Failed to load providers',
      response.status,
      response.statusText
    );
    throw new Error(`Failed to load providers (${response.status})`);
  }
  return response.json();
}

async function getConfig(): Promise<IConfig> {
  const settings = ServerConnection.makeSettings();
  const url = `${settings.baseUrl}jupyter-mynerva/config`;
  const response = await ServerConnection.makeRequest(url, {}, settings);

  if (!response.ok) {
    console.error(
      'Failed to load config',
      response.status,
      response.statusText
    );
    throw new Error(`Failed to load config (${response.status})`);
  }
  return response.json();
}

async function saveConfig(config: IConfig): Promise<void> {
  const settings = ServerConnection.makeSettings();
  const url = `${settings.baseUrl}jupyter-mynerva/config`;
  const response = await ServerConnection.makeRequest(
    url,
    {
      method: 'POST',
      body: JSON.stringify(config)
    },
    settings
  );

  if (!response.ok) {
    const data = await response.json();
    console.error('Failed to save config', response.status, data);
    throw new Error(data.error || `Failed to save config (${response.status})`);
  }
}

interface IChatResponse {
  provider: string;
  response: Record<string, unknown>;
}

function parseAssistantContent(data: IChatResponse): string {
  const { provider, response } = data;
  if (provider === 'openai') {
    const choices = response.choices as Array<{
      message?: { content?: string };
    }>;
    return choices?.[0]?.message?.content || JSON.stringify(response);
  } else if (provider === 'anthropic') {
    const content = response.content as Array<{ text?: string }>;
    return content?.[0]?.text || JSON.stringify(response);
  }
  return JSON.stringify(response);
}

async function sendChat(messages: IMessage[]): Promise<string> {
  const settings = ServerConnection.makeSettings();
  const url = `${settings.baseUrl}jupyter-mynerva/chat`;

  const response = await ServerConnection.makeRequest(
    url,
    {
      method: 'POST',
      body: JSON.stringify({ messages })
    },
    settings
  );

  if (!response.ok) {
    const data = await response.json();
    console.error('Chat request failed', response.status, data);
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  const data: IChatResponse = await response.json();
  return parseAssistantContent(data);
}

interface ISettingsViewProps {
  config: IConfig;
  providers: IProvider[];
  encryption: boolean;
  defaults: IDefaultConfig | null;
  defaultsUnavailable: boolean;
  onSave: (config: IConfig) => void;
}

function SettingsView({
  config,
  providers,
  encryption,
  defaults,
  defaultsUnavailable,
  onSave
}: ISettingsViewProps): React.ReactElement {
  const [useDefault, setUseDefault] = React.useState(
    defaultsUnavailable ? false : (config.useDefault ?? false)
  );
  const [provider, setProvider] = React.useState(config.provider);
  const [model, setModel] = React.useState(config.model);
  const [apiKey, setApiKey] = React.useState(config.apiKey);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  const currentProvider =
    providers.find(p => p.id === provider) || providers[0];
  const models = currentProvider?.models || [];

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    const newProviderData = providers.find(p => p.id === newProvider);
    if (newProviderData && !newProviderData.models.includes(model)) {
      setModel(newProviderData.models[0]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const newConfig = { provider, model, apiKey, useDefault };
      await saveConfig(newConfig);
      onSave(newConfig);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="jp-Mynerva-settings">
      {defaultsUnavailable && (
        <div className="jp-Mynerva-settings-warning">
          Default settings are no longer available. Please configure your own
          API key.
        </div>
      )}
      {defaults && (
        <div className="jp-Mynerva-settings-field jp-Mynerva-settings-checkbox">
          <label>
            <input
              type="checkbox"
              checked={useDefault}
              onChange={e => setUseDefault(e.target.checked)}
            />
            Use default settings ({defaults.provider} / {defaults.model})
          </label>
        </div>
      )}
      {!useDefault && (
        <>
          {!encryption && (
            <div className="jp-Mynerva-settings-warning">
              API keys are stored unencrypted. Set MYNERVA_SECRET_KEY for
              encryption.
            </div>
          )}
          <div className="jp-Mynerva-settings-field">
            <label>Provider</label>
            <select
              value={provider}
              onChange={e => handleProviderChange(e.target.value)}
            >
              {providers.map(p => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="jp-Mynerva-settings-field">
            <label>Model</label>
            <select value={model} onChange={e => setModel(e.target.value)}>
              {models.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="jp-Mynerva-settings-field">
            <label>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Enter API key"
            />
          </div>
        </>
      )}
      {error && <div className="jp-Mynerva-settings-error">{error}</div>}
      <button
        className="jp-Mynerva-settings-save"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}

const QUERY_ACTION_TYPES = ['getToc', 'getSection', 'getCells', 'getOutput'];
const MUTATE_ACTION_TYPES = [
  'insertCell',
  'updateCell',
  'deleteCell',
  'runCell'
];

function isQueryAction(action: IAction): action is IQueryAction {
  return QUERY_ACTION_TYPES.includes(action.type);
}

function isMutateAction(action: IAction): action is IMutateAction {
  return MUTATE_ACTION_TYPES.includes(action.type);
}

interface IChatViewProps {
  messages: IMessage[];
  onSendMessage: (content: string) => void;
  onActionShare: (
    msgIndex: number,
    actionIndex: number,
    action: IAction
  ) => void;
  onActionDismiss: (msgIndex: number, actionIndex: number) => void;
  onActionApply: (
    msgIndex: number,
    actionIndex: number,
    action: IAction
  ) => void;
  onActionCancel: (msgIndex: number, actionIndex: number) => void;
  onAcceptAll: (msgIndex: number) => void;
  onRejectAll: (msgIndex: number) => void;
  getActionStatus: (msgIndex: number, actionIndex: number) => ActionStatus;
  loading: boolean;
  hasPendingActions: boolean;
  filterEnabled: boolean;
  onFilterToggle: (enabled: boolean) => void;
}

function getDisplayContent(msg: IMessage): string {
  if (!msg.generated) {
    return msg.content;
  }
  // For generated messages, show only the first line (e.g., "[Action Results]")
  const firstLine = msg.content.split('\n')[0];
  return firstLine;
}

function ChatView({
  messages,
  onSendMessage,
  onActionShare,
  onActionDismiss,
  onActionApply,
  onActionCancel,
  onAcceptAll,
  onRejectAll,
  getActionStatus,
  loading,
  hasPendingActions,
  filterEnabled,
  onFilterToggle
}: IChatViewProps): React.ReactElement {
  const [input, setInput] = React.useState('');
  const inputDisabled = loading || hasPendingActions;

  const handleSend = () => {
    if (!input.trim() || inputDisabled) {
      return;
    }
    onSendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') {
      return;
    }
    // Shift+Enter: newline
    // isComposing: IME composing (Chrome/Firefox)
    // keyCode 229: IME input (Safari workaround)
    if (e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }
    e.preventDefault();
    handleSend();
  };

  return (
    <>
      <div className="jp-Mynerva-messages">
        {messages.map((msg, msgIndex) => {
          const actions = msg.actions || [];
          const pendingCount = actions.filter(
            (_, i) => getActionStatus(msgIndex, i) === 'pending'
          ).length;
          const hasPending = pendingCount > 0;

          return (
            <React.Fragment key={msgIndex}>
              {/* Message */}
              <div className={`jp-Mynerva-message jp-Mynerva-${msg.role}`}>
                <div className="jp-Mynerva-message-content">
                  {getDisplayContent(msg)}
                </div>
              </div>
              {/* Actions with bulk header */}
              {actions.length > 0 && (
                <div className="jp-Mynerva-actions-container">
                  {hasPending && actions.length > 1 && (
                    <div className="jp-Mynerva-actions-header">
                      <span className="jp-Mynerva-actions-count">
                        {pendingCount} action{pendingCount > 1 ? 's' : ''}
                      </span>
                      <div className="jp-Mynerva-actions-bulk">
                        <button
                          className="jp-Mynerva-bulk-button jp-Mynerva-accept-all"
                          onClick={() => onAcceptAll(msgIndex)}
                        >
                          Accept All
                        </button>
                        <button
                          className="jp-Mynerva-bulk-button jp-Mynerva-reject-all"
                          onClick={() => onRejectAll(msgIndex)}
                        >
                          Reject All
                        </button>
                      </div>
                    </div>
                  )}
                  {/* Mutate actions (left side - assistant side) */}
                  {actions.some(isMutateAction) && (
                    <div className="jp-Mynerva-actions jp-Mynerva-assistant">
                      {actions.map((action, actionIndex) =>
                        isMutateAction(action) ? (
                          <MutateActionCard
                            key={actionIndex}
                            action={action}
                            status={getActionStatus(msgIndex, actionIndex)}
                            onApply={() =>
                              onActionApply(msgIndex, actionIndex, action)
                            }
                            onCancel={() =>
                              onActionCancel(msgIndex, actionIndex)
                            }
                          />
                        ) : null
                      )}
                    </div>
                  )}
                  {/* Query actions (right side - user side) */}
                  {actions.some(isQueryAction) && (
                    <div className="jp-Mynerva-actions jp-Mynerva-user">
                      {actions.map((action, actionIndex) =>
                        isQueryAction(action) ? (
                          <QueryActionCard
                            key={actionIndex}
                            action={action}
                            status={getActionStatus(msgIndex, actionIndex)}
                            onShare={() =>
                              onActionShare(msgIndex, actionIndex, action)
                            }
                            onDismiss={() =>
                              onActionDismiss(msgIndex, actionIndex)
                            }
                          />
                        ) : null
                      )}
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
        {loading && (
          <div className="jp-Mynerva-message jp-Mynerva-assistant">
            <div className="jp-Mynerva-message-content">...</div>
          </div>
        )}
      </div>
      <div className="jp-Mynerva-input-area">
        <textarea
          className="jp-Mynerva-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            hasPendingActions
              ? 'Please respond to pending actions...'
              : 'Ask Mynerva...'
          }
          rows={2}
          disabled={inputDisabled}
        />
        <div className="jp-Mynerva-input-controls">
          <label className="jp-Mynerva-filter-toggle">
            <input
              type="checkbox"
              checked={filterEnabled}
              onChange={e => onFilterToggle(e.target.checked)}
            />
            Privacy filter (.nbfilterrc.toml)
          </label>
          <button
            className="jp-Mynerva-send"
            onClick={handleSend}
            disabled={inputDisabled}
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
}

interface IMynervaComponentProps {
  contextEngine: ContextEngine;
}

function MynervaComponent({
  contextEngine
}: IMynervaComponentProps): React.ReactElement {
  const [providers, setProviders] = React.useState<IProvider[]>([]);
  const [encryption, setEncryption] = React.useState(false);
  const [defaults, setDefaults] = React.useState<IDefaultConfig | null>(null);
  const [config, setConfig] = React.useState<IConfig | null>(null);
  const [showSettings, setShowSettings] = React.useState(false);
  const [messages, setMessages] = React.useState<IMessage[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [initializing, setInitializing] = React.useState(true);
  const [initError, setInitError] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<IFilter[]>([]);
  const [filterEnabled, setFilterEnabled] = React.useState(true);

  React.useEffect(() => {
    Promise.all([getProviders(), getConfig()])
      .then(([providersRes, cfg]) => {
        if (!providersRes.filters) {
          throw new Error('Server did not return privacy filter configuration');
        }
        setProviders(providersRes.providers);
        setEncryption(providersRes.encryption);
        setDefaults(providersRes.defaults);
        setFilters(providersRes.filters);
        setConfig(cfg);
        // Show settings if:
        // - no API key and not using defaults, OR
        // - useDefault is set but defaults are not available
        const defaultsUnavailable = cfg.useDefault && !providersRes.defaults;
        if ((!cfg.apiKey && !cfg.useDefault) || defaultsUnavailable) {
          setShowSettings(true);
        }
      })
      .catch(e => {
        setInitError(e instanceof Error ? e.message : 'Failed to initialize');
      })
      .finally(() => {
        setInitializing(false);
      });
  }, []);

  // Track action statuses: messageIndex -> actionIndex -> status
  const [actionStatuses, setActionStatuses] = React.useState<
    Map<number, Map<number, ActionStatus>>
  >(new Map());

  // Queue of action results waiting to be sent
  const [pendingResults, setPendingResults] = React.useState<string[]>([]);

  const executeQueryAction = (action: IAction): string => {
    let result: string;
    switch (action.type) {
      case 'getToc': {
        const toc = contextEngine.getToc();
        result = JSON.stringify({ type: 'getToc', result: toc }, null, 2);
        break;
      }
      case 'getSection': {
        const cells = contextEngine.getSection(action.query);
        result = JSON.stringify({ type: 'getSection', result: cells }, null, 2);
        break;
      }
      case 'getCells': {
        const cells = contextEngine.queryCells(action.query, action.count);
        result = JSON.stringify({ type: 'getCells', result: cells }, null, 2);
        break;
      }
      case 'getOutput': {
        const outputs = contextEngine.getOutput(action.query);
        result = JSON.stringify(
          { type: 'getOutput', result: outputs },
          null,
          2
        );
        break;
      }
      case 'listHelp': {
        result = JSON.stringify(
          { type: 'listHelp', result: buildSystemPrompt() },
          null,
          2
        );
        break;
      }
      case 'help': {
        result = JSON.stringify(
          { type: 'help', result: `Help for action: ${action.action}` },
          null,
          2
        );
        break;
      }
      default:
        result = JSON.stringify(
          { type: 'unknown', error: 'Unknown action type' },
          null,
          2
        );
    }

    if (filterEnabled && filters.length > 0) {
      result = applyFilters(result, filters);
    }
    return result;
  };

  const executeMutateAction = async (action: IAction): Promise<string> => {
    switch (action.type) {
      case 'insertCell': {
        const result = contextEngine.insertCell(
          action.position,
          action.cellType,
          action.source
        );
        return JSON.stringify({ type: 'insertCell', result }, null, 2);
      }
      case 'updateCell': {
        const result = contextEngine.updateCell(action.query, action.source);
        return JSON.stringify({ type: 'updateCell', result }, null, 2);
      }
      case 'deleteCell': {
        const result = contextEngine.deleteCell(action.query);
        return JSON.stringify({ type: 'deleteCell', result }, null, 2);
      }
      case 'runCell': {
        const result = await contextEngine.runCell(action.query);
        return JSON.stringify({ type: 'runCell', result }, null, 2);
      }
      default:
        return JSON.stringify(
          { type: 'unknown', error: 'Unknown action type' },
          null,
          2
        );
    }
  };

  const getActionStatus = (
    msgIndex: number,
    actionIndex: number
  ): ActionStatus => {
    return actionStatuses.get(msgIndex)?.get(actionIndex) ?? 'pending';
  };

  const hasPendingActions = messages.some((msg, msgIndex) =>
    (msg.actions || []).some(
      (_, actionIndex) => getActionStatus(msgIndex, actionIndex) === 'pending'
    )
  );

  const setActionStatus = (
    msgIndex: number,
    actionIndex: number,
    status: ActionStatus
  ) => {
    setActionStatuses(prev => {
      const newMap = new Map(prev);
      if (!newMap.has(msgIndex)) {
        newMap.set(msgIndex, new Map());
      }
      newMap.get(msgIndex)!.set(actionIndex, status);
      return newMap;
    });
  };

  const handleActionShare = (
    msgIndex: number,
    actionIndex: number,
    action: IAction
  ) => {
    setActionStatus(msgIndex, actionIndex, 'shared');

    let result: string;
    try {
      result = executeQueryAction(action);
    } catch (e) {
      console.error('Query action failed:', action.type, e);
      result = JSON.stringify(
        {
          type: action.type,
          error: e instanceof Error ? e.message : 'Unknown error'
        },
        null,
        2
      );
    }

    setPendingResults(prev => [...prev, result]);
  };

  const handleActionDismiss = (msgIndex: number, actionIndex: number) => {
    setActionStatus(msgIndex, actionIndex, 'dismissed');
  };

  const handleActionApply = async (
    msgIndex: number,
    actionIndex: number,
    action: IAction
  ) => {
    let result: string;
    try {
      result = await executeMutateAction(action);
    } catch (e) {
      console.error('Mutate action failed:', action.type, e);
      result = JSON.stringify(
        {
          type: action.type,
          error: e instanceof Error ? e.message : 'Unknown error'
        },
        null,
        2
      );
    }

    setPendingResults(prev => [...prev, result]);
    setActionStatus(msgIndex, actionIndex, 'applied');
  };

  const handleActionCancel = (msgIndex: number, actionIndex: number) => {
    setActionStatus(msgIndex, actionIndex, 'cancelled');
  };

  const handleAcceptAll = async (msgIndex: number) => {
    const msg = messages[msgIndex];
    const actions = msg.actions || [];

    for (let i = 0; i < actions.length; i++) {
      if (getActionStatus(msgIndex, i) !== 'pending') {
        continue;
      }
      const action = actions[i];
      if (isQueryAction(action)) {
        handleActionShare(msgIndex, i, action);
      } else if (isMutateAction(action)) {
        await handleActionApply(msgIndex, i, action);
      }
    }
  };

  const handleRejectAll = (msgIndex: number) => {
    const msg = messages[msgIndex];
    const actions = msg.actions || [];

    for (let i = 0; i < actions.length; i++) {
      if (getActionStatus(msgIndex, i) !== 'pending') {
        continue;
      }
      const action = actions[i];
      if (isQueryAction(action)) {
        handleActionDismiss(msgIndex, i);
      } else if (isMutateAction(action)) {
        handleActionCancel(msgIndex, i);
      }
    }
  };

  // Send results when all actions are resolved
  React.useEffect(() => {
    if (hasPendingActions || pendingResults.length === 0 || loading) {
      return;
    }

    const sendResults = async () => {
      setLoading(true);
      const results = pendingResults;
      setPendingResults([]);

      const feedbackMessage: IMessage = {
        role: 'user',
        content: `[Action Results]\n${results.join('\n\n')}`,
        generated: true
      };
      const newMessages = [...messages, feedbackMessage];
      setMessages(newMessages);

      const chatMessages = [
        { role: 'system' as const, content: buildSystemPrompt() },
        ...newMessages
      ];

      try {
        const response = await sendChat(chatMessages);
        const finalMessages = await processLLMResponse(
          response,
          newMessages,
          0
        );
        setMessages(finalMessages);
      } catch (e) {
        const errorMessage: IMessage = {
          role: 'assistant',
          content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`
        };
        setMessages(prev => [...prev, errorMessage]);
      } finally {
        setLoading(false);
      }
    };

    sendResults();
  }, [hasPendingActions, pendingResults, loading]);

  const processLLMResponse = async (
    rawContent: string,
    currentMessages: IMessage[],
    retryCount: number
  ): Promise<IMessage[]> => {
    const MAX_RETRIES = 2;
    const parseResult = parseRawContent(rawContent);

    if (parseResult.warning) {
      return [...currentMessages, { role: 'assistant', content: rawContent }];
    }

    const llmResponse = parseResult.response!;
    const validation = validateActions(llmResponse.actions);

    const assistantContent = llmResponse.messages
      .map(m => m.content)
      .filter(Boolean)
      .join('\n\n');

    if (!validation.valid && retryCount < MAX_RETRIES) {
      const assistantMessage: IMessage = {
        role: 'assistant',
        content: assistantContent || '(Action format error - retrying...)'
      };
      const feedbackMessage: IMessage = {
        role: 'user',
        content: validation.feedbackMessage!,
        generated: true
      };
      const newMessages = [
        ...currentMessages,
        assistantMessage,
        feedbackMessage
      ];
      setMessages(newMessages);

      const chatMessages = [
        { role: 'system' as const, content: buildSystemPrompt() },
        ...newMessages
      ];

      const nextResponse = await sendChat(chatMessages);
      return processLLMResponse(nextResponse, newMessages, retryCount + 1);
    }

    // Validation passed - include actions
    const assistantMessage: IMessage = {
      role: 'assistant',
      content: assistantContent || '(no message)',
      actions: llmResponse.actions as IAction[]
    };

    return [...currentMessages, assistantMessage];
  };

  const handleSendMessage = async (content: string) => {
    const userMessage: IMessage = { role: 'user', content };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setLoading(true);

    try {
      const chatMessages = [
        { role: 'system' as const, content: buildSystemPrompt() },
        ...newMessages
      ];
      const response = await sendChat(chatMessages);
      const finalMessages = await processLLMResponse(response, newMessages, 0);
      setMessages(finalMessages);
    } catch (e) {
      const errorMessage: IMessage = {
        role: 'assistant',
        content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfigSave = (newConfig: IConfig) => {
    setConfig(newConfig);
    setShowSettings(false);
  };

  if (initializing) {
    return (
      <div className={PANEL_CLASS}>
        <div className="jp-Mynerva-header">
          <span className="jp-Mynerva-title">Mynerva</span>
        </div>
        <div className="jp-Mynerva-loading">Loading...</div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className={PANEL_CLASS}>
        <div className="jp-Mynerva-header">
          <span className="jp-Mynerva-title">Mynerva</span>
        </div>
        <div className="jp-Mynerva-settings">
          <div className="jp-Mynerva-settings-error">{initError}</div>
        </div>
      </div>
    );
  }

  const defaultConfig: IConfig = {
    provider: providers[0]?.id || 'openai',
    model: providers[0]?.models[0] || '',
    apiKey: ''
  };

  return (
    <div className={PANEL_CLASS}>
      <div className="jp-Mynerva-header">
        <span className="jp-Mynerva-title">Mynerva</span>
        <button
          className="jp-Mynerva-header-button"
          onClick={() => setShowSettings(!showSettings)}
          title="Settings"
        >
          <settingsIcon.react tag="span" />
        </button>
      </div>
      {showSettings ? (
        <SettingsView
          config={config || defaultConfig}
          providers={providers}
          encryption={encryption}
          defaults={defaults}
          defaultsUnavailable={!!(config?.useDefault && !defaults)}
          onSave={handleConfigSave}
        />
      ) : (
        <ChatView
          messages={messages}
          onSendMessage={handleSendMessage}
          onActionShare={handleActionShare}
          onActionDismiss={handleActionDismiss}
          onActionApply={handleActionApply}
          onActionCancel={handleActionCancel}
          onAcceptAll={handleAcceptAll}
          onRejectAll={handleRejectAll}
          getActionStatus={getActionStatus}
          loading={loading}
          hasPendingActions={hasPendingActions}
          filterEnabled={filterEnabled}
          onFilterToggle={setFilterEnabled}
        />
      )}
    </div>
  );
}

export class MynervaPanel extends ReactWidget {
  private _contextEngine: ContextEngine;

  constructor(contextEngine: ContextEngine) {
    super();
    this._contextEngine = contextEngine;
    this.id = 'mynerva-panel';
    this.title.icon = consoleIcon;
    this.title.caption = 'Mynerva';
    this.addClass(PANEL_CLASS);
  }

  render(): React.ReactElement {
    return <MynervaComponent contextEngine={this._contextEngine} />;
  }
}

export function activatePanel(
  shell: ILabShell,
  contextEngine: ContextEngine
): void {
  const panel = new MynervaPanel(contextEngine);
  shell.add(panel, 'right', { rank: 1000 });
}
