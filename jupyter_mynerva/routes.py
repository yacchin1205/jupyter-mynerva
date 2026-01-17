import json
import os
from pathlib import Path

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado
from openai import OpenAI
from anthropic import Anthropic
from cryptography.fernet import Fernet


PROVIDERS = [
    {
        'id': 'openai',
        'displayName': 'OpenAI',
        'models': [
            'gpt-5.2',
            'gpt-5-mini',
            'gpt-5-nano',
            'gpt-4.1',
            'gpt-4.1-mini',
            'gpt-4.1-nano'
        ]
    },
    {
        'id': 'anthropic',
        'displayName': 'Anthropic',
        'models': [
            'claude-sonnet-4-5-20250929',
            'claude-haiku-4-5-20251001',
            'claude-opus-4-5-20251101',
            'claude-sonnet-4-20250514',
            'claude-opus-4-1-20250805'
        ]
    }
]

DEFAULT_PROVIDER = 'openai'
DEFAULT_MODEL = 'gpt-5.2'
ENCRYPTED_PREFIX = 'encrypted:'


def get_fernet():
    secret_key = os.environ.get('MYNERVA_SECRET_KEY')
    if secret_key:
        return Fernet(secret_key.encode())
    return None


def encrypt_api_key(api_key):
    if not api_key:
        return ''
    fernet = get_fernet()
    if fernet:
        encrypted = fernet.encrypt(api_key.encode()).decode()
        return ENCRYPTED_PREFIX + encrypted
    return api_key


def decrypt_api_key(stored_value):
    if not stored_value:
        return ''
    if stored_value.startswith(ENCRYPTED_PREFIX):
        fernet = get_fernet()
        if not fernet:
            raise ValueError('MYNERVA_SECRET_KEY is required to decrypt stored API key')
        encrypted = stored_value[len(ENCRYPTED_PREFIX):]
        return fernet.decrypt(encrypted.encode()).decode()
    return stored_value


def get_config_path():
    return Path.home() / '.mynerva' / 'config.json'


def load_config():
    config_path = get_config_path()
    if config_path.exists():
        with open(config_path) as f:
            config = json.load(f)
        config['apiKey'] = decrypt_api_key(config.get('apiKey', ''))
        return config
    return {'provider': DEFAULT_PROVIDER, 'model': DEFAULT_MODEL, 'apiKey': ''}


def save_config(config):
    config_path = get_config_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_to_save = config.copy()
    config_to_save['apiKey'] = encrypt_api_key(config.get('apiKey', ''))
    with open(config_path, 'w') as f:
        json.dump(config_to_save, f)


def is_encryption_configured():
    return bool(os.environ.get('MYNERVA_SECRET_KEY'))


class ProvidersHandler(APIHandler):
    @tornado.web.authenticated
    def get(self):
        self.finish(json.dumps({
            'providers': PROVIDERS,
            'encryption': is_encryption_configured()
        }))


class ConfigHandler(APIHandler):
    @tornado.web.authenticated
    def get(self):
        config = load_config()
        self.finish(json.dumps(config))

    @tornado.web.authenticated
    def post(self):
        config = self.get_json_body()
        save_config(config)
        self.finish(json.dumps({'status': 'ok'}))


def chat_openai(api_key, model, messages):
    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(model=model, messages=messages)
    return {'provider': 'openai', 'response': response.model_dump()}


def chat_anthropic(api_key, model, messages):
    client = Anthropic(api_key=api_key)
    response = client.messages.create(
        model=model,
        max_tokens=4096,
        messages=messages
    )
    return {'provider': 'anthropic', 'response': response.model_dump()}


class ChatHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        data = self.get_json_body()
        messages = data.get('messages', [])

        config = load_config()
        provider = config.get('provider', DEFAULT_PROVIDER)
        model = config.get('model', DEFAULT_MODEL)

        api_key = config.get('apiKey')
        if not api_key:
            if provider == 'openai':
                api_key = os.environ.get('OPENAI_API_KEY')
            elif provider == 'anthropic':
                api_key = os.environ.get('ANTHROPIC_API_KEY')

        if not api_key:
            self.set_status(500)
            self.finish(json.dumps({'error': 'API key not configured'}))
            return

        if provider == 'openai':
            result = chat_openai(api_key, model, messages)
        elif provider == 'anthropic':
            result = chat_anthropic(api_key, model, messages)
        else:
            self.set_status(400)
            self.finish(json.dumps({'error': f'Unknown provider: {provider}'}))
            return

        self.finish(json.dumps(result))


def setup_route_handlers(web_app):
    host_pattern = '.*$'
    base_url = web_app.settings['base_url']

    providers_pattern = url_path_join(base_url, 'jupyter-mynerva', 'providers')
    config_pattern = url_path_join(base_url, 'jupyter-mynerva', 'config')
    chat_pattern = url_path_join(base_url, 'jupyter-mynerva', 'chat')
    handlers = [
        (providers_pattern, ProvidersHandler),
        (config_pattern, ConfigHandler),
        (chat_pattern, ChatHandler)
    ]

    web_app.add_handlers(host_pattern, handlers)
