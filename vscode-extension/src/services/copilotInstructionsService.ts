/**
 * Thin filesystem wrapper around copilotInstructionsMerge's pure logic -
 * see that file for what actually gets written and why.
 */
import * as vscode from 'vscode';
import { mergeInstructionsContent } from './copilotInstructionsMerge';

export class CopilotInstructionsService {
  /**
   * Ensures workspaceRoot/.github/copilot-instructions.md contains the
   * progress-tracking block, creating the file/directory if needed.
   * Returns true only when the block was newly added, so the caller can
   * show a one-time notification rather than one on every activation.
   */
  public async ensureInstructions(workspaceRoot: vscode.Uri): Promise<boolean> {
    const fileUri = vscode.Uri.joinPath(workspaceRoot, '.github', 'copilot-instructions.md');

    let existingContent = '';
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      existingContent = Buffer.from(bytes).toString('utf8');
    } catch {
      existingContent = '';
    }

    const { content, wasAdded } = mergeInstructionsContent(existingContent);
    if (!wasAdded) {
      return false;
    }

    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspaceRoot, '.github'));
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
    return true;
  }
}
