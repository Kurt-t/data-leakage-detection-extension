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
import * as CodeMirror from 'codemirror';
// import { Tooltip } from '@jupyterlab/tooltip';
// import { Widget } from '@lumino/widgets';

import { requestAPI } from './handler';
//import { EditorTooltipManager, FreeTooltip } from './leakage_tooltip';


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

// TODO: 1. tag -> button content; 2. tag -> warning; 3. tag -> source line warning
const tagMap = new Map();
tagMap.set('train', "This train operation may have data leakage.");
tagMap.set('test', "This test operation may have data leakage.");
tagMap.set('test_overlap', "overlap with training data");
tagMap.set('train_overlap', "overlap with all test data");
tagMap.set('test_multiuse', "used multiple times");
tagMap.set('validation', "validation");
tagMap.set('no_test', "no independent test data");
tagMap.set('preprocessing_leak', "This operation causes a preprocessing leakage."); // TODO: make the value a html node

var underlineMarks: any[] = [];
var highlightMarks: any[] = [];  // TODO: TextMarker<MarkerRange>[]
var warningLineWidgets: any[] = [];

// create a button to mute a line's underline marker and line widget
const muteButton = (doc: CodeMirror.Doc, line: number, marker: any, lineWidget: any) => {
  const button = document.createElement("button");
  button.innerHTML = "mute";
  button.className = "mute-button";
  button.onclick = function() {
    marker.clear();
    lineWidget.clear();
    //marker.clear();  // can it be cleared twice?
    // add @suppressLeakDetection to the end of the line
    //const content = doc.getValue();
    //doc.setLine(line, content);  // TODO: setLine not found
    //console.log(content);
    //const lines = content.split('\n');
    //console.log(lines);
    //lines[line] = lines[line] + "  # @suppressLeakDetection";
    //doc.setValue(lines.join('\n'));
    //doc.getLineHandle(line).text = lines[line]; doesn't work
    //console.log(doc.setLine);
    //console.log(doc);
    // console.log(doc.getEditor()!.setLine); also undefined
    const content = doc.getLine(line);
    doc.replaceRange(content + "  # @suppressLeakDetection", {line: line, ch: 0}, {line: line, ch: content.length});
  }
  return button;
}

// function to clear all marks
const muteAll = () => {
  for (const highlightMark of highlightMarks) {
    highlightMark.clear();
  }
  highlightMarks = [];  // empty it
  for (const underlineMark of underlineMarks) {
    underlineMark.clear();
  }
  underlineMarks = [];  // empty it
  for (const warningLineWidget of warningLineWidgets) {
    warningLineWidget.clear();
  }
  warningLineWidgets = [];  // empty it
}

// create a button to jump to and highlight some lines
const jumpButton = (notebookTracker: INotebookTracker, tagSource: any) => {
  // tagSource is like: {'Tag': 'train-test', 'Source': [ {Line, Cell} ] }
  const button = document.createElement("button");
  button.innerHTML = tagSource.Tag;  // TODO: a map to assign value
  button.className = "leakage-button";
  button.onclick = function() {
    const notebook = notebookTracker.currentWidget!.content;
    notebook.deselectAll();
    // select the first line
    notebook.activeCellIndex = tagSource.Source[0].Cell;  // TODO: could be empty?
    notebook.mode = 'edit';
    let activeEditor = notebook.activeCell!.editor;
    const firstLine = tagSource.Source[0].Line
    const len = activeEditor.getLine(firstLine)!.length;
    activeEditor.setSelection({start: {line: firstLine, column: len}, end: {line: firstLine, column: len}});
    // highlight all lines
    for (const loc of tagSource.Source) {
      const line = loc.Line;
      const from = {line: line, ch: 0};
      const to = {line: line + 1, ch: 0};
      const cell: Cell = notebook.widgets[loc.Cell];
      const editor: CodeMirrorEditor = cell.inputArea.editorWidget.editor as CodeMirrorEditor;
      const doc = editor.doc;
      const marker = doc.markText(from, to, highlightClass);
      highlightMarks.push(marker);
    }
  };
  return button;
}

const highlight = (notebookTracker: INotebookTracker, highlightMap: any) => {
  if (!notebookTracker.currentWidget) {
    return;
  }
  // const message1 = "Some preprocessing before splitting the dataset might " + 
  //   "lead to data leakage. Refer to: https://scikit-learn.org/stable/common_pitfalls.html#data-leakage-during-pre-processing";
  // const message2 = "A possible leakage of this train/test is detected";
  for (const block of highlightMap) {
    // block is like: {'Location': {Line: , Cell:}, 'Label': 'train', 'Tags': [{'Tag': 'train-test', 'Source': [ {Line, Cell} ] }]}
    const line = block.Location.Line;
    const from = {line: line, ch: 0};
    const to = {line: line + 1, ch: 0};
    const notebook = notebookTracker.currentWidget.content;
    //notebook.selectionChanged.connect()
    const cell: Cell = notebook.widgets[block.Location.Cell];
    const editor: CodeMirrorEditor = cell.inputArea.editorWidget.editor as CodeMirrorEditor;
    //editor.editor.on('blur', () => console.log('blur'));
    // editor.editor.on('focus', () => console.log('focus'));
    // editor.editor.on('cursorActivity', () => console.log('cursorActivity'));
    // conclusion: 1. when this editor loses focus, 'blur' is triggered
    // 2. when the editor is focused again, 'focus' is triggered (single click)
    // 3. when a blurred editor is clicked twice, both 'focus' and 'cursorActivity' are triggered
    // 4. changing the cursor position within this editor triggers 'cursorActivity'
    
    const doc = editor.doc;
    
    //TODO: cell.children: Widget
    //cell.inputArea.children
    // underline marker
    const marker = doc.markText(from, to, underlineClass);  // problem
    underlineMarks.push(marker);
    const node = document.createElement("div");  // document
    const icon = node.appendChild(document.createElement("span"))
    
    icon.innerHTML = "!";
    icon.className = "lint-error-icon";
    let message = block.Label;
    if (tagMap.has(block.Label)) {
      message = tagMap.get(block.Label);
    }
    node.appendChild(document.createTextNode(message));
    node.className = "lint-error";
    // add inline buttons/tags
    for (const tag of block.Tags) {
      node.appendChild(jumpButton(notebookTracker, tag));
      // TODO: underline the source lines as well
      if (tagMap.has(tag.Tag)) {
        for (const source of tag.Source) {
          const line = source.Line;
          const from = {line: line, ch: 0};
          const cell: Cell = notebook.widgets[source.Cell];
          const editor: CodeMirrorEditor = cell.inputArea.editorWidget.editor as CodeMirrorEditor;
          const doc = editor.doc;
          const len = doc.getLine(line).length;
          const to = {line: line, ch: len};
          const marker = doc.markText(from, to, underlineClass);
          underlineMarks.push(marker);
          const node = document.createElement("div");  // document
          const icon = node.appendChild(document.createElement("span"))
          icon.innerHTML = "!";
          icon.className = "lint-error-icon";
          node.appendChild(document.createTextNode(tagMap.get(tag.Tag)));
          node.className = "lint-error";
          const lineWidget = doc.addLineWidget(line, node);
          warningLineWidgets.push(lineWidget);
          node.append(muteButton(doc, line, marker, lineWidget));
        }
      }
    }
    // if (block.Location.Cell === 10) {
    //   node.appendChild(jumpButton(notebookTracker));
    // }
    const lineWidget = doc.addLineWidget(line, node);
    warningLineWidgets.push(lineWidget);
    // add a mute button
    node.append(muteButton(doc, line, marker, lineWidget));
  }
}

const detect = async (filename: string, shell: JupyterFrontEnd.IShell, notebookTracker: INotebookTracker) => {
  // POST request
  const dataToSend = { name: filename };
  muteAll();
  try {
    const reply = await requestAPI<any>('detect', {
      body: JSON.stringify(dataToSend),
      method: 'POST',
    });
    console.log(reply);
    if (reply.ok) {
      // TODO: content in iframe not interactive
      // create highlightMap

      highlight(notebookTracker, reply.report);
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
class AnalyzeMenuButton implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel>
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
      label: 'Analyze Data Leakage',
      onClick: createReport,
      tooltip: 'Analyze data leakage for current notebook',
    });

    panel.toolbar.insertItem(10, 'createReport', button);
    return new DisposableDelegate(() => {
      button.dispose();
    });
  }
}

class MuteMenuButton implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel>
{
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
    const button = new ToolbarButton({
      className: 'mute-menu-button',
      label: 'Mute All',
      onClick: muteAll,
      tooltip: 'Mute all highlights and warnings',
    });

    panel.toolbar.insertItem(11, 'muteReport', button);
    return new DisposableDelegate(() => {
      // TODO: what is the dispose method for a widget?
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

    app.docRegistry.addWidgetExtension('Notebook', new AnalyzeMenuButton(shell, notebookTracker));
    app.docRegistry.addWidgetExtension('Notebook', new MuteMenuButton());
  },
};

export default plugin;
