import { ILabShell } from '@jupyterlab/application';
import { ServerConnection } from '@jupyterlab/services';
import {
  ReactWidget,
  consoleIcon,
  settingsIcon
} from '@jupyterlab/ui-components';
import * as React from 'react';

const PANEL_CLASS = 'jp-Mynerva-panel';

interface IMessage {
  role: 'user' | 'assistant';
  content: string;
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
}

async function getProviders(): Promise<IProvidersResponse> {
  const settings = ServerConnection.makeSettings();
  const url = `${settings.baseUrl}jupyter-mynerva/providers`;
  const response = await ServerConnection.makeRequest(url, {}, settings);

  if (!response.ok) {
    console.error('Failed to load providers', response.status, response.statusText);
    throw new Error(`Failed to load providers (${response.status})`);
  }
  return response.json();
}

async function getConfig(): Promise<IConfig> {
  const settings = ServerConnection.makeSettings();
  const url = `${settings.baseUrl}jupyter-mynerva/config`;
  const response = await ServerConnection.makeRequest(url, {}, settings);

  if (!response.ok) {
    console.error('Failed to load config', response.status, response.statusText);
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
    const choices = response.choices as Array<{ message?: { content?: string } }>;
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

  const currentProvider = providers.find(p => p.id === provider) || providers[0];
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
          Default settings are no longer available. Please configure your own API key.
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
              API keys are stored unencrypted. Set MYNERVA_SECRET_KEY for encryption.
            </div>
          )}
          <div className="jp-Mynerva-settings-field">
            <label>Provider</label>
            <select value={provider} onChange={e => handleProviderChange(e.target.value)}>
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

interface IChatViewProps {
  messages: IMessage[];
  onSendMessage: (content: string) => void;
  loading: boolean;
}

function ChatView({
  messages,
  onSendMessage,
  loading
}: IChatViewProps): React.ReactElement {
  const [input, setInput] = React.useState('');

  const handleSend = () => {
    if (!input.trim() || loading) {
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
        {messages.map((msg, i) => (
          <div key={i} className={`jp-Mynerva-message jp-Mynerva-${msg.role}`}>
            <div className="jp-Mynerva-message-content">{msg.content}</div>
          </div>
        ))}
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
          placeholder="Ask Mynerva..."
          rows={2}
          disabled={loading}
        />
        <button
          className="jp-Mynerva-send"
          onClick={handleSend}
          disabled={loading}
        >
          Send
        </button>
      </div>
    </>
  );
}

function MynervaComponent(): React.ReactElement {
  const [providers, setProviders] = React.useState<IProvider[]>([]);
  const [encryption, setEncryption] = React.useState(false);
  const [defaults, setDefaults] = React.useState<IDefaultConfig | null>(null);
  const [config, setConfig] = React.useState<IConfig | null>(null);
  const [showSettings, setShowSettings] = React.useState(false);
  const [messages, setMessages] = React.useState<IMessage[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [initializing, setInitializing] = React.useState(true);

  React.useEffect(() => {
    Promise.all([getProviders(), getConfig()])
      .then(([providersRes, cfg]) => {
        setProviders(providersRes.providers);
        setEncryption(providersRes.encryption);
        setDefaults(providersRes.defaults);
        setConfig(cfg);
        // Show settings if:
        // - no API key and not using defaults, OR
        // - useDefault is set but defaults are not available
        const defaultsUnavailable = cfg.useDefault && !providersRes.defaults;
        if ((!cfg.apiKey && !cfg.useDefault) || defaultsUnavailable) {
          setShowSettings(true);
        }
      })
      .catch(() => {
        setShowSettings(true);
      })
      .finally(() => {
        setInitializing(false);
      });
  }, []);

  const handleSendMessage = async (content: string) => {
    const userMessage: IMessage = { role: 'user', content };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setLoading(true);

    try {
      const response = await sendChat(newMessages);
      const assistantMessage: IMessage = { role: 'assistant', content: response };
      setMessages(prev => [...prev, assistantMessage]);
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
          loading={loading}
        />
      )}
    </div>
  );
}

export class MynervaPanel extends ReactWidget {
  constructor() {
    super();
    this.id = 'mynerva-panel';
    this.title.icon = consoleIcon;
    this.title.caption = 'Mynerva';
    this.addClass(PANEL_CLASS);
  }

  render(): React.ReactElement {
    return <MynervaComponent />;
  }
}

export function activatePanel(shell: ILabShell): void {
  const panel = new MynervaPanel();
  shell.add(panel, 'right', { rank: 1000 });
}
