import * as vscode from 'vscode';

/**
 * The Activity Bar view.
 *
 * Every command this extension has, in one place that is visible without the
 * Command Palette. A tree rather than a webview: these are commands, the
 * editor already draws command lists, and a webview here would be a second UI
 * to theme and keep alive for no gain.
 *
 * Rows that reflect a setting show its current value as their description, so
 * the view answers "is auto-processing on?" without opening anything.
 */

interface Action {
  label: string;
  command: string;
  icon: string;
  tooltip: string;
  /** Read at render time, so the row re-describes itself on refresh. */
  describe?: () => string | undefined;
}

interface Group {
  label: string;
  actions: Action[];
}

type Node = { kind: 'group'; group: Group } | { kind: 'action'; action: Action };

function settings() {
  return vscode.workspace.getConfiguration('speckitStandalone');
}

const GROUPS: Group[] = [
  {
    label: 'Dashboard',
    actions: [
      {
        label: 'Open dashboard',
        command: 'speckitStandalone.openPanel',
        icon: 'window',
        tooltip: 'Projects, artifacts, the board, context files and the document viewer',
      },
      {
        label: 'Settings',
        command: 'speckitStandalone.openSettingsPage',
        icon: 'settings-gear',
        tooltip: "The dashboard's settings page, including the AI providers",
      },
    ],
  },
  {
    label: 'AI models',
    actions: [
      {
        label: 'Manage AI providers',
        command: 'speckitStandalone.manageProviders',
        icon: 'server',
        tooltip: 'Add endpoints, test them, and set the order providers are tried in',
        describe: () => {
          const count = settings().get<unknown[]>('customModels', []).length;
          return count ? `${count} custom` : undefined;
        },
      },
      {
        label: 'Discover models',
        command: 'speckitStandalone.discoverModels',
        icon: 'search',
        tooltip: 'Ask a configured endpoint what it serves, and save one of its models',
      },
    ],
  },
  {
    label: 'Documents',
    actions: [
      {
        label: 'Process current file',
        command: 'speckitStandalone.convertCurrentFile',
        icon: 'file-pdf',
        tooltip: 'Convert the markdown file in the active editor',
      },
      {
        label: 'Auto-processing',
        command: 'speckitStandalone.toggleConvertOnSave',
        icon: 'sync',
        tooltip: 'Convert a markdown file whenever it is saved',
        describe: () => (settings().get<boolean>('convertOnSave', false) ? 'on' : 'off'),
      },
      {
        label: 'Stop processing',
        command: 'speckitStandalone.stopProcessing',
        icon: 'debug-stop',
        tooltip: 'Cancel every request in flight',
      },
    ],
  },
  {
    label: 'Diagnostics',
    actions: [
      {
        label: 'Check backend status',
        command: 'speckitStandalone.checkBackendStatus',
        icon: 'pulse',
        tooltip: 'Ping the Python process this extension spawned',
      },
      {
        label: 'Show extension logs',
        command: 'speckitStandalone.showLogs',
        icon: 'output',
        tooltip: 'The Speckit output channel',
      },
    ],
  },
];

export class SpeckitActionsProvider implements vscode.TreeDataProvider<Node> {
  public static readonly viewId = 'speckitStandalone.actions';

  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  /** Registers the view and keeps it in step with the settings it reports. */
  static register(): vscode.Disposable[] {
    const provider = new SpeckitActionsProvider();
    return [
      vscode.window.registerTreeDataProvider(SpeckitActionsProvider.viewId, provider),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('speckitStandalone')) {
          provider.refresh();
        }
      }),
    ];
  }

  refresh(): void {
    this.changed.fire(undefined);
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'group') {
      const item = new vscode.TreeItem(node.group.label, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = 'speckitGroup';
      return item;
    }

    const { action } = node;
    const item = new vscode.TreeItem(action.label, vscode.TreeItemCollapsibleState.None);
    item.command = { command: action.command, title: action.label };
    item.iconPath = new vscode.ThemeIcon(action.icon);
    item.tooltip = action.tooltip;
    item.description = action.describe?.();
    item.contextValue = 'speckitAction';
    return item;
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      return GROUPS.map((group) => ({ kind: 'group', group }));
    }
    if (node.kind === 'group') {
      return node.group.actions.map((action) => ({ kind: 'action', action }));
    }
    return [];
  }
}
