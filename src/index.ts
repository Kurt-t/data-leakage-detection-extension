import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ICommandPalette, IFrame } from '@jupyterlab/apputils';

import { PageConfig } from '@jupyterlab/coreutils';

import { ILauncher } from '@jupyterlab/launcher';

import { requestAPI } from './handler';

class IFrameWidget extends IFrame {
  constructor() {
    super();
    const baseUrl = PageConfig.getBaseUrl();
    this.url = baseUrl + 'jlab-ext-example/public/index.html';  // TODO
    this.id = 'doc-example';
    this.title.label = 'Leakage Report';
    this.title.closable = true;
    this.node.style.overflowY = 'auto';
  }
}

/**
 * The command IDs used by the server extension plugin.
 */
 namespace CommandIDs {
  export const get = 'server:get-file';
}

/**
 * Initialization data for the data-leakage-detection extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'data-leakage-detection:plugin',
  autoStart: true,
  optional: [ILauncher],
  requires: [ICommandPalette],
  activate: async (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    launcher: ILauncher | null
  ) => {
    console.log('JupyterLab extension data-leakage-detection is activated!');

    // POST request
    const dataToSend = { name: 'George' };  // TODO
    try {
      const reply = await requestAPI<any>('detect', {
        body: JSON.stringify(dataToSend),
        method: 'POST',
      });
      console.log(reply);
    } catch (reason) {
      console.error(
        `Error on POST /data-leakage-detection/detect ${dataToSend}.\n${reason}`
      );
    }

    const { commands, shell } = app;
    const command = CommandIDs.get;
    const category = 'Extension Examples';

    commands.addCommand(command, {
      label: 'Get Leakage Report in a IFrame Widget',
      caption: 'Get Leakage Report in a IFrame Widget',
      execute: () => {
        const widget = new IFrameWidget();
        shell.add(widget, 'main');
      },
    });

    palette.addItem({ command, category: category });

    if (launcher) {
      // Add launcher
      launcher.add({
        command: command,
        category: category,
      });
    }
  },
};

export default plugin;
