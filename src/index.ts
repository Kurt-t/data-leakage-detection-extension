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
import { Tooltip } from '@jupyterlab/tooltip';
import { Widget } from '@lumino/widgets';

import { requestAPI } from './handler';
//import { EditorTooltipManager, FreeTooltip } from './leakage_tooltip';

// class NewTooltip extends Tooltip {
//   constructor(options: Tooltip.IOptions) {
//     super(options);
//     this.hide();
//   }

//   handleEvent(event: Event): void {
//     if (this.isDisposed) {
//       return;
//     }

//     const { node } = this;
//     const target = event.target as HTMLElement;

//     switch (event.type) {
//       case 'mouseover': {
//         this.show();
//         break;
//       }
//       case 'keydown': {
//         // ESC or Backspace cancel anyways
//         this.hide();
//         break;
//       }
//       case 'mousedown': {
//         if (node.contains(target)) {
//           this.activate();
//           return;
//         }
//         this.hide();
//         break;
//       }
//       default:
//         super.handleEvent(event);
//         break;
//     }
//   }
// }

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

const underlineClass = {
  className: 'leakage-detection-underline',
  // dotted, wavy, or dashed
  css: `
    text-decoration: underline dashed red;
    text-decoration-skip-ink: none;
  `,
  //title: 'Potential preprocessing leakage'  // set tooltips
}

const jumpButton = (notebookTracker: INotebookTracker) => {
  const button = document.createElement("button");
  button.innerHTML = "Jump to leakage source";
  button.className = "leakage-button";
  button.onclick = function() {
    // jump to
    const highlightMap = [
      {cell: 4, loc: [{line: 5, ch: 0}]},
      {cell: 5, loc: [{line: 0, ch: 0}]},
      {cell: 5, loc: [{line: 1, ch: 0}]},
    ]
    const notebook = notebookTracker.currentWidget!.content;
    notebook.deselectAll();
    notebook.activeCellIndex = 4;
    notebook.mode = 'edit';
    let activeEditor = notebook.activeCell!.editor;
    const len = activeEditor.getLine(5)!.length;
    activeEditor.setSelection({start: {line: 5, column: len}, end: {line: 5, column: len}});
    for (const block of highlightMap) {
      const line = block.loc[0].line;
      const from = {line: line, ch: 0};
      const to = {line: line + 1, ch: 0};
      const cell: Cell = notebook.widgets[block.cell];
      const editor: CodeMirrorEditor = cell.inputArea.editorWidget.editor as CodeMirrorEditor;
      const doc = editor.doc;
      doc.markText(from, to, highlightClass);
    }
  };
  return button;
}

const highlight = (notebookTracker: INotebookTracker, highlightMap: any) => {
  if (!notebookTracker.currentWidget) {
    return;
  }
  const message1 = "Some preprocessing before splitting the dataset might " + 
    "lead to data leakage. Refer to: https://scikit-learn.org/stable/common_pitfalls.html#data-leakage-during-pre-processing";
  const message2 = "A possible leakage of this train/test is detected";
  if (!highlightMap) {
    highlightMap = [
      {cell: 4, loc: [{line: 5, ch: 0}], message: message1},
      {cell: 5, loc: [{line: 0, ch: 0}], message: message1},
      {cell: 5, loc: [{line: 1, ch: 0}], message: message1},
      {cell: 10, loc: [{line: 2, ch: 0}], message: message2},
      {cell: 10, loc: [{line: 3, ch: 0}], message: message2},
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
    //TODO: cell.children: Widget
    cell.inputArea.children
    doc.markText(from, to, underlineClass);
    const node = document.createElement("div");  // document
    var icon = node.appendChild(document.createElement("span"))
    icon.innerHTML = "!";
    icon.className = "lint-error-icon";
    node.appendChild(document.createTextNode(block.message));
    node.className = "lint-error";
    if (block.cell === 10) {
      node.appendChild(jumpButton(notebookTracker));
    }
    //doc.addLineWidget(line, node);

    //const bundle = { 'text/plain': "test string" };
    //const tooltip = new NewTooltip({anchor: notebook, bundle, editor, rendermime: notebook.rendermime});
    //Widget.attach(tooltip, editor.host);
    //editor.editor.addWidget(from, tooltip.node, true);
    // if (block.cell === 4) {
    //   const bundle = { 'text/plain': "test string test string\n" };
    //   const tooltip = new Tooltip({anchor: notebook, bundle, editor, rendermime: notebook.rendermime});
    //   Widget.attach(tooltip, document.body);
    // }
    // Option: editor.editor.addLineClass
    const lines = editor.host.getElementsByClassName("CodeMirror-code")[0];

    const testLine = lines.childNodes[line];
    console.log(testLine);
    const bundle = { 'text/plain':  block.message};
    if (block.cell === 4) {
      testLine.addEventListener('mouseenter', (event) => {  // mouseenter so that only execute once
        console.log("enter event");
        const tooltip = new Tooltip({anchor: notebook, bundle, editor, rendermime: notebook.rendermime});
        Widget.attach(tooltip, document.body);
        console.log("finish event");
      });
    }
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

// reference: TODO
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
    //commands.addKeyBinding()

    palette.addItem({ command, category: category });

    app.docRegistry.addWidgetExtension('Notebook', new ButtonExtension(shell, notebookTracker));
  },
};

export default plugin;
