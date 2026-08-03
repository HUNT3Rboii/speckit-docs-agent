/**
 * Thin filesystem wrapper around gitignoreMerge's pure logic - see that
 * file for what actually gets written and why.
 */
import * as vscode from 'vscode';
import { mergeGitignoreContent } from './gitignoreMerge';

export class GitignoreService {
  /** Ensures workspaceRoot/.gitignore excludes the progress-signal
   * directory, creating .gitignore if it doesn't exist. */
  public async ensureProgressDirIgnored(workspaceRoot: vscode.Uri): Promise<void> {
    const fileUri = vscode.Uri.joinPath(workspaceRoot, '.gitignore');

    let existingContent = '';
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      existingContent = Buffer.from(bytes).toString('utf8');
    } catch {
      existingContent = '';
    }

    const { content, wasAdded } = mergeGitignoreContent(existingContent);
    if (!wasAdded) {
      return;
    }

    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
  }
}
