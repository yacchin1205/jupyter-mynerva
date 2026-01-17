import {
  ILabShell,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { activatePanel } from './panel';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-mynerva:plugin',
  description:
    'A JupyterLab extension that provides an LLM-powered assistant with deep understanding of notebook structure.',
  autoStart: true,
  requires: [ILabShell],
  optional: [ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    shell: ILabShell,
    settingRegistry: ISettingRegistry | null
  ) => {
    console.log('JupyterLab extension jupyter-mynerva is activated!');

    activatePanel(shell);

    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log('jupyter-mynerva settings loaded:', settings.composite);
        })
        .catch(reason => {
          console.error('Failed to load settings for jupyter-mynerva.', reason);
        });
    }
  }
};

export default plugin;
