import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { requestAPI } from './request';

/**
 * Initialization data for the jupyter-mynerva extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-mynerva:plugin',
  description: 'A JupyterLab extension that provides an LLM-powered assistant with deep understanding of notebook structure.',
  autoStart: true,
  optional: [ISettingRegistry],
  activate: (app: JupyterFrontEnd, settingRegistry: ISettingRegistry | null) => {
    console.log('JupyterLab extension jupyter-mynerva is activated!');

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

    requestAPI<any>('hello')
      .then(data => {
        console.log(data);
      })
      .catch(reason => {
        console.error(
          `The jupyter_mynerva server extension appears to be missing.\n${reason}`
        );
      });
  }
};

export default plugin;
