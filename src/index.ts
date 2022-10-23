import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { requestAPI } from './handler';

/**
 * Initialization data for the data-leakage-detection extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'data-leakage-detection:plugin',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension data-leakage-detection is activated!');

    requestAPI<any>('get_example')
      .then(data => {
        console.log(data);
      })
      .catch(reason => {
        console.error(
          `The data_leakage_detection server extension appears to be missing.\n${reason}`
        );
      });
  }
};

export default plugin;
