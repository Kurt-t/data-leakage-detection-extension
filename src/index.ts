import {
  ILabShell,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import type { IRetroShell } from '@retrolab/application';

import { ICommandPalette, ToolbarButton } from '@jupyterlab/apputils';

//import { PageConfig } from '@jupyterlab/coreutils';

import { IDisposable, DisposableDelegate } from '@lumino/disposable';

import { CommandRegistry } from '@lumino/commands';

import { DocumentRegistry } from '@jupyterlab/docregistry';

import { NotebookPanel, INotebookModel, INotebookTracker } from '@jupyterlab/notebook';

import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { Cell } from '@jupyterlab/cells';
//import * as CodeMirror from 'codemirror';

import { requestAPI } from './handler';

/**
 * The command IDs used by the server extension plugin.
 */
 namespace CommandIDs {
  export const get = 'server:get-file';
}

const highlightClass = {
  className: 'leakage-detection-highlight',
  css: `
    background-color: var(--jp-warn-color2)
  `
}

const highlight = (notebookTracker: INotebookTracker, highlightMap: any) => {
  if (!notebookTracker.currentWidget) {
    return;
  }
  if (!highlightMap) {
    highlightMap = [
      {cell: 4, loc: [{line: 5, ch: 0}]},
      {cell: 5, loc: [{line: 0, ch: 0}]},
      {cell: 5, loc: [{line: 1, ch: 0}]},
      {cell: 10, loc: [{line: 2, ch: 0}]},
      {cell: 10, loc: [{line: 3, ch: 0}]},
    ];
  }
  for (const block of highlightMap) {
    const line = block.loc[0].line;
    const from = {line: line, ch: 0};
    const to = {line: line + 1, ch: 0};
    const notebook = notebookTracker.currentWidget.content;
    const cell: Cell = notebook.widgets[block.cell];
    const editor: CodeMirrorEditor = cell.inputArea.editorWidget.editor as CodeMirrorEditor;
    const doc = editor.doc;
    doc.markText(from, to, highlightClass);
  }
}

const detect = async (filename: string, shell: JupyterFrontEnd.IShell, notebookTracker: INotebookTracker) => {
  // POST request
  const dataToSend = { name: filename }; 
  try {
    const reply = await requestAPI<any>('detect', {
      body: JSON.stringify(dataToSend),
      method: 'POST',
    });
    console.log(reply);
    if (reply.ok) {
      // TODO: content in iframe not interactive
      highlight(notebookTracker, null);
    }
    // TODO: if not ok
  } catch (reason) {
    console.error(
      `Error on POST /data-leakage-detection/detect ${dataToSend}.\n${reason}`
    );
    // TODO: if error
  }
}

class ButtonExtension implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel>
{
  shell: JupyterFrontEnd.IShell
  notebookTracker: INotebookTracker
  constructor(shell: JupyterFrontEnd.IShell, notebookTracker: INotebookTracker) {
    this.shell = shell;
    this.notebookTracker = notebookTracker;
  }
  
  /**
   * Create a new extension for the notebook panel widget.
   *
   * @param panel Notebook panel
   * @param context Notebook context
   * @returns Disposable on the added button
   */
  createNew(
    panel: NotebookPanel,
    context: DocumentRegistry.IContext<INotebookModel>
  ): IDisposable {
    const createReport = () => {
      detect(context.path, this.shell, this.notebookTracker);
    };
    const button = new ToolbarButton({
      className: 'create-report-button',
      label: 'Create Detection Report',
      onClick: createReport,
      tooltip: 'Create Detection Report',
    });

    panel.toolbar.insertItem(10, 'createReport', button);
    return new DisposableDelegate(() => {
      button.dispose();
    });
  }
}

/**
 * Initialization data for the data-leakage-detection extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'data-leakage-detection:plugin',
  autoStart: true,
  requires: [
    ICommandPalette,
    INotebookTracker,
    //IEditorTracker,
  ],
  activate: async (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    notebookTracker: INotebookTracker,
  ) => {
    console.log('JupyterLab extension data-leakage-detection is activated!');

    const { commands } = app;
    
    const command = CommandIDs.get;
    const category = 'Extension Examples';
    let shell = app.shell as ILabShell | IRetroShell ;
    let current_file = '';
    shell.currentChanged.connect((_: any, change: any) => {
        // TODO: check newValue not null, type is file/notebook
        const { newValue } = change;
        current_file = newValue && newValue.context && newValue.context._path;
    });

    commands.addCommand(command, {
      label: 'Leakage Detection',
      caption: 'Leakage Detection',
      execute: (() => detect(current_file, shell, notebookTracker)) as unknown as CommandRegistry.CommandFunc<Promise<any>>  // TODO: why
    });

    palette.addItem({ command, category: category });

    app.docRegistry.addWidgetExtension('Notebook', new ButtonExtension(shell, notebookTracker));
  },
};

export default plugin;
